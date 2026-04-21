#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'node:path';

import { ClaudeCollector } from './collectors/claude';
import { CopilotCollector } from './collectors/copilot';
import { GeminiCollector } from './collectors/gemini';
import { IntakeCollector } from './collectors/intake';
import { OpenClawCollector } from './collectors/openclaw';
import { GitCollector, ShellCollector } from './collectors/shell';
import { loadConfig } from './core/config';
import { runSync } from './core/sync';
import { loadState } from './core/state';
import { appendManualCapture } from './obsidian/writer';
import { Linker } from './synthesis/linker';
import { Collector, EventKind, EventSource } from './types';

function parseFlags(args: string[]): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current?.startsWith('--')) {
      const key = current.slice(2);
      const value = args[index + 1];
      if (value && !value.startsWith('--')) {
        flags[key] = value;
        index += 1;
      } else {
        flags[key] = 'true';
      }
      continue;
    }

    rest.push(current ?? '');
  }

  return { flags, rest };
}

async function main() {
  const config = loadConfig();
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'dump') {
    const text = args.slice(1).join(' ');
    if (!text) {
      console.error('Usage: urchin dump "your thought"');
      process.exit(1);
    }

    await dumpThought(config, text);
    return;
  }

  if (command === 'ingest') {
    await ingest(config, args.slice(1));
    return;
  }

  if (command === 'status') {
    await status(config);
    return;
  }

  await sync(config);
}

async function dumpThought(config: ReturnType<typeof loadConfig>, text: string) {
  const linker = new Linker(config.vaultRoot);
  await linker.initialize();
  await appendManualCapture(config, linker, text);
  console.log(`Urchin: capture written to ${config.inboxCapturePath}`);
}

async function sync(config: ReturnType<typeof loadConfig>) {
  const collectors: Collector[] = [
    new IntakeCollector(config),
    new CopilotCollector(config),
    new GeminiCollector(config),
    new ClaudeCollector(config),
    new OpenClawCollector(config),
    new ShellCollector(config),
    new GitCollector(config),
  ];

  const linker = new Linker(config.vaultRoot);
  await linker.initialize();

  const result = await runSync(config, { collectors, linker });
  console.log(`Urchin: syncing context since ${result.sinceDate}`);

  if (result.failedCollectors.length > 0) {
    for (const failure of result.failedCollectors) {
      console.error(`Urchin: collector ${failure.collector} failed`, failure.error);
    }
    console.error('Urchin: state was not advanced because one or more collectors failed.');
    if (result.writtenPaths.length > 0) {
      console.error(`Urchin: wrote ${result.writtenPaths.length} archive note(s) from successful collectors.`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.eventCount === 0) {
    console.log('Urchin: no new events to sync.');
    return;
  }

  console.log(`Urchin: updated ${result.writtenPaths.length} archive note(s) under ${config.archiveRoot}`);
}

async function status(config: ReturnType<typeof loadConfig>) {
  const state = await loadState(config.statePath);
  console.log(
    JSON.stringify(
      {
        archiveRoot: config.archiveRoot,
        claudeHistoryFile: config.claudeHistoryFile,
        copilotSessionRoot: config.copilotSessionRoot,
        geminiTmpRoot: config.geminiTmpRoot,
        inboxCapturePath: config.inboxCapturePath,
        intakeRoot: config.intakeRoot,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt ?? null,
        openclawCommandsLog: config.openclawCommandsLog,
        reposRoots: config.reposRoots,
        shellHistoryFile: config.shellHistoryFile,
        statePath: config.statePath,
        vaultRoot: config.vaultRoot,
      },
      null,
      2,
    ),
  );
}

async function ingest(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags, rest } = parseFlags(args);
  const content = rest.join(' ').trim();
  if (!content) {
    console.error('Usage: urchin ingest --source browser --kind capture --location extension://name "captured text"');
    process.exit(1);
  }

  const knownSources: EventSource[] = ['browser', 'claude', 'copilot', 'gemini', 'git', 'manual', 'openclaw', 'shell'];
  const knownKinds: EventKind[] = ['activity', 'capture', 'code', 'conversation', 'ops'];
  const source = knownSources.includes(flags.source as EventSource) ? (flags.source as EventSource) : 'manual';
  const kind = knownKinds.includes(flags.kind as EventKind) ? (flags.kind as EventKind) : 'capture';
  const targetFile = path.join(config.intakeRoot, `${source}.jsonl`);
  const event = {
    id: randomUUID(),
    source,
    kind,
    timestamp: new Date().toISOString(),
    summary: flags.summary ?? content.slice(0, 140),
    content,
    tags: flags.tags ? flags.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    metadata: {
      ...(flags.location ? { location: flags.location } : {}),
      ...(flags.title ? { title: flags.title } : {}),
    },
    scope: flags.scope === 'network' ? 'network' : 'local',
    sessionId: flags.sessionId,
  };

  await fs.ensureDir(path.dirname(targetFile));
  await fs.appendFile(targetFile, `${JSON.stringify(event)}\n`, 'utf8');
  console.log(`Urchin: ingested ${source} event into ${targetFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
