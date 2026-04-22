import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { writeArchive, writeArchiveIndex } from '../src/obsidian/writer';
import { Linker } from '../src/synthesis/linker';
import { UrchinEvent } from '../src/types';

async function withTempVault(run: (config: UrchinConfig, linker: Linker) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-writer-'));
  const vaultRoot = path.join(root, 'vault');
  const config: UrchinConfig = {
    agentEventsPath: path.join(root, '.local', 'share', 'urchin', 'agents', 'events.jsonl'),
    archiveIndexPath: path.join(vaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(vaultRoot, '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(vaultRoot, '00-inbox', 'urchin-capture.md'),
    intakeRoot: path.join(root, 'intake'),
    intakePort: 18799,
    intakePortFile: path.join(root, 'intake.port'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    openclawCronRunsDir: path.join(root, '.openclaw', 'cron', 'runs'),
    eventCachePath: path.join(root, '.local', 'share', 'urchin', 'event-cache.jsonl'),
    eventJournalPath: path.join(root, '.local', 'share', 'urchin', 'journal', 'events.jsonl'),
    projectAliasPath: path.join(root, '.config', 'urchin', 'project-aliases.json'),
    reposRoots: [path.join(root, 'dev')],
    shellIgnorePrefixes: ['cd', 'ls'],
    shellMinCommandLength: 8,
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    timerCadence: '5m',
    vaultRoot,
    vscodeWorkspaceAliasesPath: path.join(root, '.config', 'urchin', 'vscode-workspaces.json'),
    vscodeEventsPath: path.join(root, '.local', 'share', 'urchin', 'editors', 'vscode', 'events.jsonl'),
  };

  await fs.ensureDir(vaultRoot);
  await fs.ensureDir(path.join(vaultRoot, '10-projects'));
  await fs.writeFile(path.join(vaultRoot, '10-projects', 'urchin.md'), '# Urchin\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, '10-projects', 'openclaw.md'), '# OpenClaw\n', 'utf8');

  const linker = new Linker(vaultRoot, config.projectAliasPath);
  await linker.initialize();

  try {
    await run(config, linker);
  } finally {
    await fs.remove(root);
  }
}

function event(overrides: Partial<UrchinEvent> = {}): UrchinEvent {
  return {
    id: 'evt-1',
    kind: 'code',
    source: 'git',
    timestamp: '2026-04-21T08:00:00.000Z',
    summary: 'feat: build project views',
    content: 'feat: build project views',
    tags: [],
    metadata: {},
    provenance: {
      adapter: 'git-log',
      location: '/tmp/repo',
      scope: 'local',
      repo: 'urchin',
    },
    ...overrides,
  };
}

test('writeArchive emits daily, project, triage, and index notes', async () => {
  await withTempVault(async (config, linker) => {
    const written = await writeArchive(config, linker, [
      event(),
      event({
        id: 'evt-2',
        source: 'browser',
        kind: 'capture',
        timestamp: '2026-04-21T08:05:00.000Z',
        summary: 'Saved a browser note',
        content: 'Saved a browser note for later',
        provenance: {
          adapter: 'append-only-intake',
          location: '/tmp/intake/browser.jsonl',
          scope: 'network',
        },
      }),
    ]);
    await writeArchiveIndex(config);

    assert.equal(written.length, 3);

    const dailyPath = path.join(config.archiveRoot, 'daily', '2026', '04', '2026-04-21.md');
    const projectPath = path.join(config.archiveRoot, 'projects', 'urchin', '2026', '04', '2026-04-21.md');
    const triagePath = path.join(config.archiveRoot, 'triage', '2026', '04', '2026-04-21.md');
    const indexPath = config.archiveIndexPath;

    const [daily, project, triage, index] = await Promise.all([
      fs.readFile(dailyPath, 'utf8'),
      fs.readFile(projectPath, 'utf8'),
      fs.readFile(triagePath, 'utf8'),
      fs.readFile(indexPath, 'utf8'),
    ]);

    assert.match(daily, /## Projects/);
    assert.match(daily, /\[\[urchin\]\] x1/);
    assert.match(project, /Urchin Project Activity — urchin — 2026-04-21/);
    assert.match(triage, /Urchin Triage — 2026-04-21/);
    assert.match(index, /## Daily Timelines/);
    assert.match(index, /## Project Activity/);
    assert.match(index, /## Triage/);
  });
});

test('writeArchive groups repo activity under the resolved project note name', async () => {
  await withTempVault(async (config, linker) => {
    await writeArchive(config, linker, [
      event({
        provenance: {
          adapter: 'git-log',
          location: '/tmp/repo',
          scope: 'local',
          repo: 'openclaw-workspace-braindump',
        },
      }),
    ]);

    const projectPath = path.join(config.archiveRoot, 'projects', 'openclaw', '2026', '04', '2026-04-21.md');
    const project = await fs.readFile(projectPath, 'utf8');

    assert.match(project, /Urchin Project Activity — openclaw — 2026-04-21/);
    assert.match(project, /\*\*Project:\*\* \[\[openclaw\]\]/);
  });
});
