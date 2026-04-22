import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { initializeVault } from '../src/bootstrap/init';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-init-'));
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

  try {
    await run(config, root);
  } finally {
    await fs.remove(root);
  }
}

test('initializeVault scaffolds a starter vault without overwriting key notes', async () => {
  await withTempConfig(async (config) => {
    const result = await initializeVault({ config, mode: 'starter' });

    assert.equal(result.mode, 'starter');
    assert.equal(await fs.pathExists(path.join(config.vaultRoot, 'HOME.md')), true);
    assert.equal(await fs.pathExists(path.join(config.vaultRoot, '30-resources', 'ai', 'urchin.md')), true);
    assert.equal(await fs.pathExists(config.projectAliasPath), true);
    assert.equal(await fs.pathExists(config.vscodeWorkspaceAliasesPath), true);
    assert.equal(result.created.includes('HOME.md'), true);
  });
});

test('initializeVault wires an existing vault and preserves existing files', async () => {
  await withTempConfig(async (config) => {
    await fs.ensureDir(config.vaultRoot);
    await fs.writeFile(path.join(config.vaultRoot, 'HOME.md'), '# Existing Home\n', 'utf8');

    const result = await initializeVault({ config, mode: 'existing' });
    const home = await fs.readFile(path.join(config.vaultRoot, 'HOME.md'), 'utf8');

    assert.equal(home, '# Existing Home\n');
    assert.equal(await fs.pathExists(config.inboxCapturePath), true);
    assert.equal(await fs.pathExists(path.join(config.vaultRoot, '40-archive', 'urchin')), true);
    assert.equal(result.reused.includes(config.projectAliasPath), false);
    assert.equal(result.reused.includes(config.vscodeWorkspaceAliasesPath), false);
  });
});
