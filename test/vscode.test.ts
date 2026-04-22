import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { Linker } from '../src/synthesis/linker';
import { VSCodeCollector } from '../src/collectors/vscode';
import { writeArchive } from '../src/obsidian/writer';

async function withTempHarness(
  run: (config: UrchinConfig, linker: Linker) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-vscode-'));
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

  await fs.ensureDir(path.join(vaultRoot, '10-projects'));
  await fs.writeFile(path.join(vaultRoot, '10-projects', 'openclaw.md'), '# OpenClaw\n', 'utf8');

  const linker = new Linker(vaultRoot, config.projectAliasPath);
  await linker.initialize();

  try {
    await run(config, linker);
  } finally {
    await fs.remove(root);
  }
}

test('VSCodeCollector captures workspace-aware editor events and routes them into project activity', async () => {
  await withTempHarness(async (config, linker) => {
    await fs.ensureDir(path.dirname(config.vscodeEventsPath));
    await fs.writeFile(
      config.vscodeEventsPath,
      `${JSON.stringify({
        id: 'vs-1',
        timestamp: '2026-04-21T08:10:00.000Z',
        sessionId: 'chat-1',
        workspacePath: '/home/samhc/dev/openclaw-workspace-braindump',
        filePath: '/home/samhc/dev/openclaw-workspace-braindump/src/app.ts',
        role: 'assistant',
        title: 'Copilot Chat',
        content: 'Explained how the bridge routes editor context into the vault.',
      })}\n`,
      'utf8',
    );

    const collector = new VSCodeCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, 'vscode');
    assert.equal(events[0]?.provenance.repo, 'openclaw-workspace-braindump');
    assert.equal(events[0]?.metadata.workspacePath, '/home/samhc/dev/openclaw-workspace-braindump');

    await writeArchive(config, linker, events);

    const projectPath = path.join(config.archiveRoot, 'projects', 'openclaw', '2026', '04', '2026-04-21.md');
    const project = await fs.readFile(projectPath, 'utf8');

    assert.match(project, /vscode \/ conversation/);
    assert.match(project, /\*\*Editor:\*\* `vscode`/);
    assert.match(project, /\*\*Workspace:\*\* `\/home\/samhc\/dev\/openclaw-workspace-braindump`/);
    assert.match(project, /\*\*File:\*\* `\/home\/samhc\/dev\/openclaw-workspace-braindump\/src\/app.ts`/);
    assert.match(project, /\*\*Project:\*\* \[\[openclaw\]\]/);
  });
});

test('VSCodeCollector allows derived session ids and alias-style workspace values upstream', async () => {
  await withTempHarness(async (config) => {
    await fs.ensureDir(path.dirname(config.vscodeEventsPath));
    await fs.writeFile(
      config.vscodeEventsPath,
      `${JSON.stringify({
        id: 'vs-2',
        timestamp: '2026-04-21T08:10:00.000Z',
        sessionId: 'openclaw-workspace-braindump-2026-04-21',
        workspacePath: '/home/samhc/dev/openclaw-workspace-braindump',
        content: 'Quick editor capture.',
      })}\n`,
      'utf8',
    );

    const collector = new VSCodeCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events[0]?.provenance.sessionId, 'openclaw-workspace-braindump-2026-04-21');
  });
});
