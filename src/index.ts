#!/usr/bin/env node

import { ClaudeCollector } from './collectors/claude';
import { CopilotCollector } from './collectors/copilot';
import { GeminiCollector } from './collectors/gemini';
import { OpenClawCollector } from './collectors/openclaw';
import { GitCollector, ShellCollector } from './collectors/shell';
import { loadConfig } from './core/config';
import { dedupeEvents } from './core/dedupe';
import { sanitize } from './core/redaction';
import { loadState, saveState } from './core/state';
import { appendManualCapture, writeArchive, writeArchiveIndex } from './obsidian/writer';
import { Linker } from './synthesis/linker';
import { UrchinEvent } from './types';

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
  const state = await loadState(config.statePath);
  const sinceDate = state.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  console.log(`Urchin: syncing context since ${sinceDate.toISOString()}`);

  const collectors = [
    new CopilotCollector(config),
    new GeminiCollector(config),
    new ClaudeCollector(config),
    new OpenClawCollector(config),
    new ShellCollector(config),
    new GitCollector(config),
  ];

  const linker = new Linker(config.vaultRoot);
  await linker.initialize();

  let allEvents: UrchinEvent[] = [];

  for (const collector of collectors) {
    try {
      const events = await collector.collect(sinceDate);
      allEvents.push(...events);
    } catch (error) {
      console.error(`Error in collector ${collector.name}:`, error);
    }
  }

  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const uniqueEvents = dedupeEvents(allEvents);

  if (uniqueEvents.length === 0) {
    console.log('Urchin: no new events to sync.');
    return;
  }

  const sanitizedEvents = uniqueEvents.map((event) => ({
    ...event,
    summary: sanitize(event.summary, 240),
    content: sanitize(event.content),
  }));

  const writtenPaths = await writeArchive(config, linker, sanitizedEvents);
  await writeArchiveIndex(config, writtenPaths);
  await saveState(config.statePath, { lastSuccessfulSyncAt: new Date().toISOString() });

  console.log(`Urchin: updated ${writtenPaths.length} timeline note(s) under ${config.archiveRoot}`);
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

main().catch(console.error);
