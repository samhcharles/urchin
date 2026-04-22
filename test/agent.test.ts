import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { AgentCollector } from '../src/collectors/agent';
import { UrchinConfig } from '../src/core/config';
import { writeArchive } from '../src/obsidian/writer';
import { Linker } from '../src/synthesis/linker';

async function withTempHarness(run: (config: UrchinConfig, linker: Linker) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-agent-'));
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

test('AgentCollector captures generic local agent events and routes them into project activity', async () => {
  await withTempHarness(async (config, linker) => {
    await fs.ensureDir(path.dirname(config.agentEventsPath));
    await fs.writeFile(
      config.agentEventsPath,
      `${JSON.stringify({
        id: 'agent-1',
        agent: 'codex',
        agentType: 'general-purpose',
        status: 'completed',
        model: 'gpt-5.4',
        timestamp: '2026-04-21T08:10:00.000Z',
        sessionId: 'urchin-2026-04-21',
        workspacePath: '/home/samhc/dev/urchin',
        filePath: '/home/samhc/dev/urchin/src/index.ts',
        title: 'Collector pass',
        content: 'Finished the collector pass cleanly.',
      })}\n`,
      'utf8',
    );

    const collector = new AgentCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, 'agent');
    assert.equal(events[0]?.metadata.agent, 'codex');
    assert.equal(events[0]?.provenance.repo, 'urchin');

    await writeArchive(config, linker, events);

    const projectPath = path.join(config.archiveRoot, 'projects', 'urchin', '2026', '04', '2026-04-21.md');
    const project = await fs.readFile(projectPath, 'utf8');

    assert.match(project, /agent \/ agent/);
    assert.match(project, /\*\*Agent:\*\* `codex`/);
    assert.match(project, /\*\*Agent type:\*\* `general-purpose`/);
    assert.match(project, /\*\*Model:\*\* `gpt-5.4`/);
    assert.match(project, /\*\*Status:\*\* `completed`/);
    assert.match(project, /\*\*Workspace:\*\* `\/home\/samhc\/dev\/urchin`/);
    assert.match(project, /\*\*Project:\*\* \[\[urchin\]\]/);
  });
});

test('AgentCollector ignores malformed or incomplete queue entries', async () => {
  await withTempHarness(async (config) => {
    await fs.ensureDir(path.dirname(config.agentEventsPath));
    await fs.writeFile(
      config.agentEventsPath,
      [
        JSON.stringify({ agent: 'codex', content: '', timestamp: '2026-04-21T08:10:00.000Z' }),
        JSON.stringify({ content: 'Missing agent name', timestamp: '2026-04-21T08:11:00.000Z' }),
        '{not-json}',
      ].join('\n'),
      'utf8',
    );

    const collector = new AgentCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events.length, 0);
  });
});
