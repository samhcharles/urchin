#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';

import { setupIntakeService } from './bootstrap/intake';
import { initializeVault, InitMode } from './bootstrap/init';
import { setupPersonalWorkflow } from './bootstrap/personal';
import { AgentCollector } from './collectors/agent';
import { ClaudeCollector } from './collectors/claude';
import { CopilotCollector } from './collectors/copilot';
import { GeminiCollector } from './collectors/gemini';
import { IntakeCollector } from './collectors/intake';
import { OpenClawCollector } from './collectors/openclaw';
import { GitCollector, ShellCollector } from './collectors/shell';
import { VSCodeCollector } from './collectors/vscode';
import { loadConfig } from './core/config';
import { buildDoctorReport } from './core/doctor';
import { startIntakeServer } from './intake/server';
import { startMcpServer } from './mcp/server';
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

  if (command === 'mcp') {
    await startMcpServer(config);
    return;
  }

  if (command === 'serve') {
    await serve(config);
    return;
  }

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

  if (command === 'ingest-vscode') {
    await ingestVSCode(config, args.slice(1));
    return;
  }

  if (command === 'ingest-agent') {
    await ingestAgent(config, args.slice(1));
    return;
  }

  if (command === 'init') {
    await init(config, args.slice(1));
    return;
  }

  if (command === 'setup-intake') {
    await setupIntake(config, args.slice(1));
    return;
  }

  if (command === 'setup-personal') {
    await setupPersonal(config, args.slice(1));
    return;
  }

  if (command === 'status') {
    await status(config);
    return;
  }

  if (command === 'doctor') {
    await doctor(config);
    return;
  }

  await sync(config);
}

async function dumpThought(config: ReturnType<typeof loadConfig>, text: string) {
  const linker = new Linker(config.vaultRoot, config.projectAliasPath);
  await linker.initialize();
  await appendManualCapture(config, linker, text);
  console.log(`Urchin: capture written to ${config.inboxCapturePath}`);
}

async function init(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags } = parseFlags(args);
  const mode: InitMode = flags.mode === 'starter' ? 'starter' : 'existing';
  const result = await initializeVault({
    config,
    mode,
    vaultRoot: flags.vault,
  });

  console.log(`Urchin: initialized ${mode} vault wiring at ${result.vaultRoot}`);
  if (result.created.length > 0) {
    console.log(`Urchin: created ${result.created.length} path(s)`);
  }
  if (result.reused.length > 0) {
    console.log(`Urchin: reused ${result.reused.length} existing path(s)`);
  }
}

function applyVaultOverride(config: ReturnType<typeof loadConfig>, vaultRoot?: string) {
  if (!vaultRoot) {
    return config;
  }

  const resolvedVaultRoot = path.resolve(vaultRoot);
  return {
    ...config,
    archiveIndexPath: path.join(resolvedVaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(resolvedVaultRoot, '40-archive', 'urchin'),
    inboxCapturePath: path.join(resolvedVaultRoot, '00-inbox', 'urchin-capture.md'),
    vaultRoot: resolvedVaultRoot,
  };
}

async function setupPersonal(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags } = parseFlags(args);
  const mode: InitMode = flags.mode === 'starter' ? 'starter' : 'existing';
  const effectiveConfig = applyVaultOverride(config, flags.vault);
  const cadence = flags.cadence ?? effectiveConfig.timerCadence;
  const personalConfig = { ...effectiveConfig, timerCadence: cadence };

  await initializeVault({
    config: personalConfig,
    mode,
    vaultRoot: flags.vault,
  });

  const result = await setupPersonalWorkflow({
    config: personalConfig,
    enableSystemd: flags.enable === 'true',
    timerCadence: cadence,
  });

  console.log(`Urchin: personal workflow setup written to ${result.written.length} path(s).`);
  if (result.created.length > 0) {
    console.log(`Urchin: created ${result.created.length} new personal workflow path(s).`);
  }
  if (result.updated.length > 0) {
    console.log(`Urchin: updated ${result.updated.length} existing personal workflow path(s).`);
  }
  console.log(`Urchin: systemd available: ${result.state.systemdAvailable}`);
  console.log(`Urchin: timer enabled: ${result.state.timerEnabled === null ? 'unknown' : result.state.timerEnabled}`);
  console.log(`Urchin: timer active: ${result.state.timerActive === null ? 'unknown' : result.state.timerActive}`);
}

async function setupIntake(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags } = parseFlags(args);
  const result = await setupIntakeService({
    config,
    enableSystemd: flags.enable === 'true',
  });

  console.log(`Urchin: intake service setup written to ${result.written.length} path(s).`);
  if (result.created.length > 0) {
    console.log(`Urchin: created ${result.created.length} new intake service path(s).`);
  }
  if (result.updated.length > 0) {
    console.log(`Urchin: updated ${result.updated.length} existing intake service path(s).`);
  }
  console.log(`Urchin: systemd available: ${result.state.systemdAvailable}`);
  console.log(`Urchin: intake service enabled: ${result.state.serviceEnabled === null ? 'unknown' : result.state.serviceEnabled}`);
  console.log(`Urchin: intake service active: ${result.state.serviceActive === null ? 'unknown' : result.state.serviceActive}`);
}

function formatSyncSummary(result: Awaited<ReturnType<typeof runSync>>): string[] {
  const lines = [
    `Urchin: collected ${result.collectedCount} event(s), deduped to ${result.dedupedCount}, wrote ${result.writtenCount}.`,
    `Urchin: promotion wrote ${result.promotedCount} note(s) (${result.promotionSummary.projectNotes} project, ${result.promotionSummary.resourceNotes} resource, decisions from ${result.promotionSummary.decisions} event(s)).`,
  ];

  if (result.promotionNotReason) {
    lines.push(`Urchin: promotion skipped broader surfaces because ${result.promotionNotReason}.`);
  }

  for (const source of result.sourceBreakdown.sort((a, b) => a.source.localeCompare(b.source))) {
    lines.push(
      source.error
        ? `Urchin: ${source.source} failed (${source.error}).`
        : `Urchin: ${source.source} collected ${source.collectedCount} event(s).`,
    );
  }

  return lines;
}

async function sync(config: ReturnType<typeof loadConfig>) {
  const collectors: Collector[] = [
    new AgentCollector(config),
    new IntakeCollector(config),
    new CopilotCollector(config),
    new GeminiCollector(config),
    new ClaudeCollector(config),
    new OpenClawCollector(config),
    new ShellCollector(config),
    new GitCollector(config),
    new VSCodeCollector(config),
  ];

  const linker = new Linker(config.vaultRoot, config.projectAliasPath);
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
    for (const line of formatSyncSummary(result)) {
      console.log(line);
    }
    console.log('Urchin: no new events to sync.');
    return;
  }

  console.log(`Urchin: updated ${result.writtenPaths.length} archive note(s) under ${config.archiveRoot}`);
  if (result.promotedPaths.length > 0) {
    console.log(`Urchin: updated ${result.promotedPaths.length} promoted note(s) outside the archive.`);
  }
  for (const line of formatSyncSummary(result)) {
    console.log(line);
  }
}

async function status(config: ReturnType<typeof loadConfig>) {
  const state = await loadState(config.statePath);
  console.log(
    JSON.stringify(
      {
        agentEventsPath: config.agentEventsPath,
        archiveRoot: config.archiveRoot,
        claudeHistoryFile: config.claudeHistoryFile,
        copilotSessionRoot: config.copilotSessionRoot,
        eventJournalPath: config.eventJournalPath,
        geminiTmpRoot: config.geminiTmpRoot,
        inboxCapturePath: config.inboxCapturePath,
        intakeRoot: config.intakeRoot,
        lastSuccessfulSyncAt: state.lastSuccessfulSyncAt ?? null,
        openclawCommandsLog: config.openclawCommandsLog,
        openclawCronRunsDir: config.openclawCronRunsDir,
        projectAliasPath: config.projectAliasPath,
        reposRoots: config.reposRoots,
        shellHistoryFile: config.shellHistoryFile,
        statePath: config.statePath,
        vaultRoot: config.vaultRoot,
        vscodeEventsPath: config.vscodeEventsPath,
      },
      null,
      2,
    ),
  );
}

async function doctor(config: ReturnType<typeof loadConfig>) {
  const report = await buildDoctorReport(config);
  console.log(JSON.stringify(report, null, 2));
}

async function ingest(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags, rest } = parseFlags(args);
  const content = rest.join(' ').trim();
  if (!content) {
    console.error('Usage: urchin ingest --source browser --kind capture --location extension://name "captured text"');
    process.exit(1);
  }

  const knownSources: EventSource[] = ['agent', 'browser', 'claude', 'copilot', 'gemini', 'git', 'manual', 'openclaw', 'shell', 'vscode'];
  const knownKinds: EventKind[] = ['activity', 'agent', 'capture', 'code', 'conversation', 'ops'];
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

async function ingestVSCode(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags, rest } = parseFlags(args);
  const content = rest.join(' ').trim();
  const workspacePath = await resolveWorkspacePath(config, flags.workspace);
  if (!content || !workspacePath) {
    console.error(
      'Usage: urchin ingest-vscode --workspace /path/to/workspace-or-alias [--session session-id] [--role user|assistant] [--file /path/to/file] [--title "Chat title"] "message"',
    );
    process.exit(1);
  }
  const sessionId = flags.session ?? deriveVSCodeSessionId(workspacePath, flags.title);

  const event = {
    id: randomUUID(),
    content,
    filePath: flags.file,
    kind: flags.kind === 'agent' ? 'agent' : 'conversation',
    role: flags.role,
    selection: flags.selection,
    sessionId,
    summary: flags.summary,
    timestamp: new Date().toISOString(),
    title: flags.title,
    workspacePath,
  };

  await fs.ensureDir(path.dirname(config.vscodeEventsPath));
  await fs.appendFile(config.vscodeEventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  console.log(`Urchin: ingested vscode event into ${config.vscodeEventsPath}`);
}

async function ingestAgent(config: ReturnType<typeof loadConfig>, args: string[]) {
  const { flags, rest } = parseFlags(args);
  const content = rest.join(' ').trim();
  const agent = flags.agent?.trim();
  const workspacePath = await resolveWorkspacePath(config, flags.workspace);
  if (!content || !agent) {
    console.error(
      'Usage: urchin ingest-agent --agent codex|custom-name [--workspace /path/to/workspace-or-alias] [--session session-id] [--status launched|running|completed|failed] [--model model-name] [--file /path/to/file] [--title "Task title"] "message"',
    );
    process.exit(1);
  }

  const sessionId = flags.session ?? deriveAgentSessionId(agent, workspacePath, flags.title);
  const event = {
    id: randomUUID(),
    agent,
    agentType: flags.type,
    content,
    filePath: flags.file,
    kind: flags.kind === 'conversation' ? 'conversation' : 'agent',
    model: flags.model,
    role: flags.role,
    sessionId,
    status: flags.status,
    summary: flags.summary,
    timestamp: new Date().toISOString(),
    title: flags.title,
    workspacePath,
  };

  await fs.ensureDir(path.dirname(config.agentEventsPath));
  await fs.appendFile(config.agentEventsPath, `${JSON.stringify(event)}\n`, 'utf8');
  console.log(`Urchin: ingested agent event into ${config.agentEventsPath}`);
}

function deriveVSCodeSessionId(workspacePath: string, title?: string): string {
  const base = title?.trim() || path.basename(workspacePath) || 'vscode';
  return `${base.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
}

function deriveAgentSessionId(agent: string, workspacePath?: string, title?: string): string {
  const workspaceBase = workspacePath ? path.basename(workspacePath) : '';
  const base = title?.trim() || workspaceBase || agent || 'agent';
  return `${base.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;
}

async function resolveWorkspacePath(config: ReturnType<typeof loadConfig>, workspaceArg?: string): Promise<string | undefined> {
  if (!workspaceArg) {
    return undefined;
  }

  const expanded = workspaceArg === '~' || workspaceArg.startsWith('~/')
    ? path.join(os.homedir(), workspaceArg === '~' ? '' : workspaceArg.slice(2))
    : workspaceArg;
  if (expanded.startsWith('/')) {
    return expanded;
  }

  const aliases = (await fs.pathExists(config.vscodeWorkspaceAliasesPath))
    ? await fs.readJson(config.vscodeWorkspaceAliasesPath).catch(() => ({}))
    : {};
  const resolved = aliases?.[workspaceArg];
  if (typeof resolved === 'string' && resolved.trim()) {
    return resolved;
  }

  for (const repoRoot of config.reposRoots) {
    const candidate = path.join(repoRoot, workspaceArg);
    if (await fs.pathExists(candidate)) {
      return candidate;
    }
  }

  return workspaceArg;
}

async function serve(config: ReturnType<typeof loadConfig>) {
  const { server, port } = await startIntakeServer(config);
  console.log(`Urchin: intake server listening on http://127.0.0.1:${port}`);
  console.log(`Urchin: port recorded at ${config.intakePortFile}`);
  console.log('Urchin: POST /ingest  { content, source?, kind?, summary?, tags?, metadata? }');
  console.log('Urchin: GET  /health  → { status: "ok", service: "urchin-intake", port }');

  const shutdown = async () => {
    await fs.remove(config.intakePortFile).catch(() => undefined);
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => { /* keep alive */ });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
