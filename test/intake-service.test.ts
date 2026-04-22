import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { setupIntakeService } from '../src/bootstrap/intake';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-intake-service-'));
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
     identityPath: path.join(root, '.config', 'urchin', 'identity.json'),
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

test('setupIntakeService writes a machine-specific env and service unit', async () => {
  await withTempConfig(async (config, root) => {
    const result = await setupIntakeService({
      config,
      enableSystemd: false,
      homeRoot: root,
      nodePath: '/usr/bin/node',
      scriptPath: '/tmp/urchin/dist/src/index.js',
    });

    const envPath = path.join(root, '.config', 'urchin', 'personal.env');
    const servicePath = path.join(root, '.config', 'systemd', 'user', 'urchin-intake.service');

    const [env, service] = await Promise.all([
      fs.readFile(envPath, 'utf8'),
      fs.readFile(servicePath, 'utf8'),
    ]);

    assert.equal(result.written.length, 3);
    assert.match(env, /URCHIN_INTAKE_ROOT/);
    assert.match(env, /URCHIN_IDENTITY_PATH/);
    assert.match(env, /URCHIN_REMOTE_MIRROR_ROOT/);
    assert.match(env, /URCHIN_VAULT_ROOT/);
    assert.match(service, /EnvironmentFile=.*personal\.env/);
    assert.match(service, /ExecStart="\/usr\/bin\/node" "\/tmp\/urchin\/dist\/src\/index\.js" serve/);
    assert.match(service, /Restart=on-failure/);
  });
});
