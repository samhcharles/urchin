import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { pullRemoteJournal } from '../src/replication/remote';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-remote-pull-'));
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

test('pullRemoteJournal mirrors a remote journal and manifest into the local mirror root', async () => {
  await withTempConfig(async (config) => {
    const result = await pullRemoteJournal({
      config,
      host: 'user@host',
      name: 'vps',
      now: () => new Date('2026-04-22T22:45:00.000Z'),
      runCommand: async (_file, args) => {
        const command = args[1] ?? '';
        if (command.includes('journal')) {
          return {
            stdout: '{"id":"evt-1","kind":"conversation","source":"claude","timestamp":"2026-04-22T21:00:00.000Z","summary":"remote","content":"continued work","tags":[],"metadata":{},"provenance":{"adapter":"claude-history","location":"/remote/history.jsonl","scope":"local"}}\n',
          };
        }

        return {
          stdout: '{"accountId":"samhc","actorId":"samhc","deviceId":"vps-1","visibility":"private"}\n',
        };
      },
    });

    assert.equal(result.eventCount, 1);
    assert.equal(result.identityFetched, true);

    const mirroredJournal = await fs.readFile(result.journalMirrorPath, 'utf8');
    const manifest = await fs.readJson(result.manifestPath);
    const mirroredIdentity = await fs.readJson(result.identityMirrorPath);

    assert.match(mirroredJournal, /evt-1/);
    assert.equal(manifest.mirrorName, 'vps');
    assert.equal(manifest.host, 'user@host');
    assert.equal(manifest.pulledAt, '2026-04-22T22:45:00.000Z');
    assert.equal(mirroredIdentity.deviceId, 'vps-1');
  });
});

test('pullRemoteJournal keeps working when remote identity is missing', async () => {
  await withTempConfig(async (config) => {
    const result = await pullRemoteJournal({
      config,
      host: 'user@host',
      name: 'vps',
      runCommand: async (_file, args) => {
        const command = args[1] ?? '';
        if (command.includes('journal')) {
          return { stdout: '' };
        }

        throw new Error('remote identity missing');
      },
    });

    assert.equal(result.identityFetched, false);
    assert.equal(await fs.pathExists(result.identityMirrorPath), false);
    assert.equal(await fs.pathExists(result.manifestPath), true);
  });
});
