import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { ensureNodeIdentity, resolveNodeIdentity } from '../src/core/identity';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-identity-'));
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

test('ensureNodeIdentity persists a durable node profile', async () => {
  await withTempConfig(async (config) => {
    const resolved = await ensureNodeIdentity(
      config,
      {
        accountId: 'SamHC',
        actorId: 'Sam Founder',
        deviceId: 'WSL Dev',
        visibility: 'team',
      },
      () => new Date('2026-04-22T22:00:00.000Z'),
    );

    assert.equal(resolved.exists, true);
    assert.equal(resolved.identity.accountId, 'samhc');
    assert.equal(resolved.identity.actorId, 'sam-founder');
    assert.equal(resolved.identity.deviceId, 'wsl-dev');
    assert.equal(resolved.identity.visibility, 'team');

    const written = await fs.readJson(config.identityPath);
    assert.equal(written.createdAt, '2026-04-22T22:00:00.000Z');
    assert.equal(written.updatedAt, '2026-04-22T22:00:00.000Z');
  });
});

test('resolveNodeIdentity prefers env overrides over the persisted identity file', async () => {
  const originalActor = process.env.URCHIN_ACTOR_ID;
  const originalDevice = process.env.URCHIN_DEVICE_ID;

  process.env.URCHIN_ACTOR_ID = 'env-actor';
  process.env.URCHIN_DEVICE_ID = 'env-device';

  try {
    await withTempConfig(async (config) => {
      await fs.ensureDir(path.dirname(config.identityPath));
      await fs.writeJson(config.identityPath, {
        accountId: 'file-account',
        actorId: 'file-actor',
        deviceId: 'file-device',
        visibility: 'private',
      });

      const resolved = await resolveNodeIdentity(config);
      assert.equal(resolved.identity.accountId, 'file-account');
      assert.equal(resolved.identity.actorId, 'env-actor');
      assert.equal(resolved.identity.deviceId, 'env-device');
      assert.equal(resolved.sources.accountId, 'file');
      assert.equal(resolved.sources.actorId, 'env');
      assert.equal(resolved.sources.deviceId, 'env');
    });
  } finally {
    if (originalActor === undefined) delete process.env.URCHIN_ACTOR_ID;
    else process.env.URCHIN_ACTOR_ID = originalActor;

    if (originalDevice === undefined) delete process.env.URCHIN_DEVICE_ID;
    else process.env.URCHIN_DEVICE_ID = originalDevice;
  }
});
