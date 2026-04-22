import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { RemoteCollector } from '../src/collectors/remote';
import { UrchinConfig } from '../src/core/config';
import { UrchinEvent } from '../src/types';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-remote-collector-'));
  const vaultRoot = path.join(root, 'vault');
  const config: UrchinConfig = {
    agentEventsPath: path.join(root, '.local', 'share', 'urchin', 'agents', 'events.jsonl'),
    archiveIndexPath: path.join(vaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(vaultRoot, '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    eventCachePath: path.join(root, '.local', 'share', 'urchin', 'event-cache.jsonl'),
    eventJournalPath: path.join(root, '.local', 'share', 'urchin', 'journal', 'events.jsonl'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    identityPath: path.join(root, '.config', 'urchin', 'identity.json'),
    inboxCapturePath: path.join(vaultRoot, '00-inbox', 'urchin-capture.md'),
    intakePort: 18799,
    intakePortFile: path.join(root, 'intake.port'),
    intakeRoot: path.join(root, 'intake'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    openclawCronRunsDir: path.join(root, '.openclaw', 'cron', 'runs'),
    projectAliasPath: path.join(root, '.config', 'urchin', 'project-aliases.json'),
    remoteMirrorRoot: path.join(root, '.local', 'share', 'urchin', 'remotes'),
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

  try {
    await run(config, root);
  } finally {
    await fs.remove(root);
  }
}

function remoteEvent(overrides: Partial<UrchinEvent> = {}): UrchinEvent {
  return {
    id: 'remote-1',
    kind: 'conversation',
    source: 'claude',
    timestamp: '2026-04-22T20:00:00.000Z',
    summary: 'remote session',
    content: 'continued work on the VPS',
    tags: ['vps'],
    metadata: {},
    identity: {
      accountId: 'samhc',
      actorId: 'samhc',
      deviceId: 'vps-1',
      visibility: 'private',
    },
    provenance: {
      adapter: 'claude-history',
      location: '/home/samhc/.claude/history.jsonl',
      scope: 'local',
      sessionId: 'vps-session',
    },
    ...overrides,
  };
}

test('RemoteCollector reads mirrored remote journals into the sync pipeline', async () => {
  await withTempConfig(async (config) => {
    const mirrorDir = path.join(config.remoteMirrorRoot, 'vps');
    await fs.ensureDir(mirrorDir);
    await fs.writeFile(path.join(mirrorDir, 'events.jsonl'), `${JSON.stringify(remoteEvent())}\n`, 'utf8');

    const collector = new RemoteCollector(config);
    const events = await collector.collect();

    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, 'claude');
    assert.equal(events[0]?.metadata.remoteMirrorName, 'vps');
  });
});

test('RemoteCollector respects per-source since filters', async () => {
  await withTempConfig(async (config) => {
    const mirrorDir = path.join(config.remoteMirrorRoot, 'vps');
    await fs.ensureDir(mirrorDir);
    const lines = [
      JSON.stringify(remoteEvent({ id: 'old', timestamp: '2026-04-22T19:00:00.000Z' })),
      JSON.stringify(remoteEvent({ id: 'new', timestamp: '2026-04-22T21:00:00.000Z' })),
    ].join('\n') + '\n';
    await fs.writeFile(path.join(mirrorDir, 'events.jsonl'), lines, 'utf8');

    const collector = new RemoteCollector(config);
    const events = await collector.collect(new Date('2026-04-22T20:30:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events[0]?.id, 'new');
  });
});
