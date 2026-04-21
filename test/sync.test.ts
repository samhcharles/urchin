import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { runSync } from '../src/core/sync';
import { Linker } from '../src/synthesis/linker';
import { Collector, UrchinEvent } from '../src/types';

class StaticCollector implements Collector {
  constructor(
    public readonly name: Collector['name'],
    private readonly events: UrchinEvent[],
  ) {}

  async collect(): Promise<UrchinEvent[]> {
    return this.events;
  }
}

class FailingCollector implements Collector {
  constructor(public readonly name: Collector['name']) {}

  async collect(): Promise<UrchinEvent[]> {
    throw new Error(`collector ${this.name} failed`);
  }
}

async function withTempSyncHarness(
  run: (config: UrchinConfig, linker: Linker) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-sync-'));
  const vaultRoot = path.join(root, 'vault');
  const config: UrchinConfig = {
    archiveIndexPath: path.join(vaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(vaultRoot, '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(vaultRoot, '00-inbox', 'urchin-capture.md'),
    intakeRoot: path.join(root, 'intake'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    projectAliasPath: path.join(root, '.config', 'urchin', 'project-aliases.json'),
    reposRoots: [path.join(root, 'dev')],
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    vaultRoot,
    vscodeEventsPath: path.join(root, '.local', 'share', 'urchin', 'editors', 'vscode', 'events.jsonl'),
  };

  await fs.ensureDir(path.join(vaultRoot, '10-projects'));
  await fs.writeFile(path.join(vaultRoot, '10-projects', 'urchin.md'), '# Urchin\n', 'utf8');

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
    summary: 'feat: write project archive',
    content: 'feat: write project archive',
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

test('runSync checkpoints from sync start when the run succeeds', async () => {
  await withTempSyncHarness(async (config, linker) => {
    const result = await runSync(config, {
      collectors: [new StaticCollector('git', [event()])],
      linker,
      now: () => new Date('2026-04-21T09:00:00.000Z'),
    });

    const state = await fs.readJson(config.statePath);

    assert.equal(result.failedCollectors.length, 0);
    assert.equal(state.lastSuccessfulSyncAt, '2026-04-21T09:00:00.000Z');
  });
});

test('runSync does not advance state when any collector fails', async () => {
  await withTempSyncHarness(async (config, linker) => {
    await fs.ensureDir(path.dirname(config.statePath));
    await fs.writeJson(config.statePath, { lastSuccessfulSyncAt: '2026-04-21T07:00:00.000Z' });

    const result = await runSync(config, {
      collectors: [
        new StaticCollector('git', [event()]),
        new FailingCollector('claude'),
      ],
      linker,
      now: () => new Date('2026-04-21T09:00:00.000Z'),
    });

    const state = await fs.readJson(config.statePath);

    assert.equal(result.failedCollectors.length, 1);
    assert.equal(result.writtenPaths.length > 0, true);
    assert.equal(state.lastSuccessfulSyncAt, '2026-04-21T07:00:00.000Z');
    assert.equal(state.lastSyncStartedAt, '2026-04-21T09:00:00.000Z');
    assert.equal(state.sources.git.lastSuccessAt, '2026-04-21T09:00:00.000Z');
    assert.equal(state.sources.claude.lastError, 'collector claude failed');
  });
});
