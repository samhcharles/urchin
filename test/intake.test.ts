import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { IntakeCollector } from '../src/collectors/intake';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-intake-'));
  const config: UrchinConfig = {
    agentEventsPath: path.join(root, '.local', 'share', 'urchin', 'agents', 'events.jsonl'),
    archiveIndexPath: path.join(root, 'vault', '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(root, 'vault', '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(root, 'vault', '00-inbox', 'urchin-capture.md'),
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
    vaultRoot: path.join(root, 'vault'),
    vscodeWorkspaceAliasesPath: path.join(root, '.config', 'urchin', 'vscode-workspaces.json'),
    vscodeEventsPath: path.join(root, '.local', 'share', 'urchin', 'editors', 'vscode', 'events.jsonl'),
  };

  try {
    await run(config);
  } finally {
    await fs.remove(root);
  }
}

test('IntakeCollector parses local and network events from the append-only queue', async () => {
  await withTempConfig(async (config) => {
    await fs.ensureDir(config.intakeRoot);
    await fs.writeFile(
      path.join(config.intakeRoot, 'browser.jsonl'),
      [
        JSON.stringify({
          id: 'evt-1',
          source: 'browser',
          kind: 'capture',
          timestamp: '2026-04-21T08:10:00.000Z',
          summary: 'Browser capture',
          content: 'Saved a browser snippet',
          scope: 'network',
          sessionId: 'browser-session',
        }),
        JSON.stringify({
          id: 'evt-2',
          content: '',
        }),
      ].join('\n'),
      'utf8',
    );

    const collector = new IntakeCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, 'browser');
    assert.equal(events[0]?.kind, 'capture');
    assert.equal(events[0]?.provenance.scope, 'network');
    assert.equal(events[0]?.provenance.sessionId, 'browser-session');
  });
});

test('IntakeCollector ignores symlinked files that escape the intake root', async () => {
  await withTempConfig(async (config) => {
    const externalRoot = path.join(path.dirname(config.intakeRoot), 'external');
    await fs.ensureDir(externalRoot);
    await fs.ensureDir(config.intakeRoot);

    const externalFile = path.join(externalRoot, 'outside.jsonl');
    await fs.writeFile(
      externalFile,
      `${JSON.stringify({
        id: 'outside-1',
        source: 'browser',
        kind: 'capture',
        timestamp: '2026-04-21T08:10:00.000Z',
        content: 'Should not be read through a symlink',
      })}\n`,
      'utf8',
    );

    await fs.symlink(externalFile, path.join(config.intakeRoot, 'outside.jsonl'));

    const collector = new IntakeCollector(config);
    const events = await collector.collect(new Date('2026-04-21T08:00:00.000Z'));

    assert.equal(events.length, 0);
  });
});
