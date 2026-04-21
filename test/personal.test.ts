import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { setupPersonalWorkflow } from '../src/bootstrap/personal';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-personal-'));
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
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
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

test('setupPersonalWorkflow writes the personal env, systemd units, and workflow note', async () => {
  await withTempConfig(async (config, root) => {
    const result = await setupPersonalWorkflow({
      config,
      enableSystemd: false,
      homeRoot: root,
      nodePath: '/usr/bin/node',
      scriptPath: '/tmp/urchin/dist/src/index.js',
    });

    const envPath = path.join(root, '.config', 'urchin', 'personal.env');
    const servicePath = path.join(root, '.config', 'systemd', 'user', 'urchin.service');
    const timerPath = path.join(root, '.config', 'systemd', 'user', 'urchin.timer');
    const notePath = path.join(config.vaultRoot, '30-resources', 'ai', 'urchin-personal.md');

    const [env, service, timer, note] = await Promise.all([
      fs.readFile(envPath, 'utf8'),
      fs.readFile(servicePath, 'utf8'),
      fs.readFile(timerPath, 'utf8'),
      fs.readFile(notePath, 'utf8'),
    ]);

    assert.equal(result.written.length, 4);
    assert.match(env, /URCHIN_VAULT_ROOT/);
    assert.match(env, /URCHIN_AGENT_EVENTS_PATH/);
    assert.match(service, /ExecStart="\/usr\/bin\/node" "\/tmp\/urchin\/dist\/src\/index\.js" sync/);
    assert.match(timer, /OnUnitActiveSec=5m/);
    assert.match(note, /Urchin Personal Workflow/);
    assert.match(note, /Agent bridge queue/);
  });
});

test('setupPersonalWorkflow respects custom timer cadence', async () => {
  await withTempConfig(async (config, root) => {
    await setupPersonalWorkflow({
      config: { ...config, timerCadence: '10m' },
      enableSystemd: false,
      homeRoot: root,
      nodePath: '/usr/bin/node',
      scriptPath: '/tmp/urchin/dist/src/index.js',
      timerCadence: '10m',
    });

    const timerPath = path.join(root, '.config', 'systemd', 'user', 'urchin.timer');
    const envPath = path.join(root, '.config', 'urchin', 'personal.env');
    const notePath = path.join(config.vaultRoot, '30-resources', 'ai', 'urchin-personal.md');
    const env = await fs.readFile(envPath, 'utf8');
    const note = await fs.readFile(notePath, 'utf8');
    const timer = await fs.readFile(timerPath, 'utf8');
    assert.match(env, /URCHIN_TIMER_CADENCE="10m"/);
    assert.match(note, /Timer cadence: `10m`/);
    assert.match(timer, /OnUnitActiveSec=10m/);
  });
});
