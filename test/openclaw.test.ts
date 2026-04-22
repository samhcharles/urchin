import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { OpenClawCollector } from '../src/collectors/openclaw';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-openclaw-'));
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

  try {
    await run(config);
  } finally {
    await fs.remove(root);
  }
}

test('OpenClawCollector keeps text-bearing command log entries and ignores control noise', async () => {
  await withTempConfig(async (config) => {
    await fs.ensureDir(path.dirname(config.openclawCommandsLog));
    await fs.writeFile(
      config.openclawCommandsLog,
      [
        JSON.stringify({
          timestamp: '2026-04-21T08:00:00.000Z',
          action: 'new',
          sessionKey: 'agent:main:main',
          senderId: 'openclaw-control-ui',
          source: 'webchat',
        }),
        JSON.stringify({
          timestamp: '2026-04-21T08:05:00.000Z',
          action: 'prompt',
          text: 'Draft the daily brief from local sources only.',
          sessionKey: 'agent:main:main',
          senderId: 'samhc',
          source: 'webchat',
        }),
        '[2026-04-21T08:06:00.000Z] user: Legacy prompt format still works',
      ].join('\n'),
      'utf8',
    );

    const collector = new OpenClawCollector(config);
    const events = await collector.collect(new Date('2026-04-21T07:59:00.000Z'));

    assert.equal(events.length, 2);

    const commandEvents = events.filter((event) => event.tags.includes('command'));
    assert.equal(commandEvents.length, 2);
    assert.equal(events.some((event) => event.content === 'new'), false);
    assert.equal(commandEvents[0]?.content, 'Draft the daily brief from local sources only.');
    assert.equal(commandEvents[0]?.metadata.action, 'prompt');
    assert.equal(commandEvents[1]?.content, 'Legacy prompt format still works');
  });
});

test('OpenClawCollector captures cron summaries with normalized agent metadata', async () => {
  await withTempConfig(async (config) => {
    await fs.ensureDir(config.openclawCronRunsDir);
    await fs.writeFile(
      path.join(config.openclawCronRunsDir, 'daily-brief.jsonl'),
      [
        JSON.stringify({
          ts: 1776585694760,
          jobId: 'daily-brief',
          action: 'finished',
          status: 'error',
          summary: 'Calendar data is unavailable in cron.\n\n---\n\nDaily brief body.',
          deliveryStatus: 'unknown',
          sessionId: 'ef16202c-90a2-4958-8793-bb8d9d5472a5',
          sessionKey: 'agent:main:cron:daily-brief:run:ef16202c-90a2-4958-8793-bb8d9d5472a5',
          durationMs: 94751,
          model: 'claude-sonnet-4-6',
          provider: 'claude-cli',
        }),
        JSON.stringify({
          ts: 1776585695000,
          jobId: 'maintenance',
          action: 'finished',
          status: 'completed',
          summary: '## Maintenance Report — 2026-04-19 09:00 UTC',
          sessionId: '45d5ca1a-8809-4da9-a5ba-0d5c3ea021e6',
          sessionKey: 'agent:maintenance:cron:maintenance:run:45d5ca1a-8809-4da9-a5ba-0d5c3ea021e6',
          durationMs: 1200,
          model: 'claude-haiku-4-5',
        }),
      ].join('\n'),
      'utf8',
    );

    const collector = new OpenClawCollector(config);
    const events = await collector.collect(new Date('2026-04-19T00:00:00.000Z'));

    assert.equal(events.length, 2);

    const dailyBrief = events.find((event) => event.metadata.agent === 'daily-brief');
    assert.ok(dailyBrief);
    assert.equal(dailyBrief.kind, 'activity');
    assert.equal(dailyBrief.metadata.status, 'error');
    assert.equal(dailyBrief.metadata.model, 'claude-sonnet-4-6');
    assert.equal(dailyBrief.provenance.sessionId, 'ef16202c-90a2-4958-8793-bb8d9d5472a5');

    const maintenance = events.find((event) => event.metadata.agent === 'maintenance');
    assert.ok(maintenance);
    assert.equal(maintenance.kind, 'ops');
    assert.equal(maintenance.metadata.status, 'completed');
  });
});

test('OpenClawCollector ignores malformed or incomplete cron entries', async () => {
  await withTempConfig(async (config) => {
    await fs.ensureDir(config.openclawCronRunsDir);
    await fs.writeFile(
      path.join(config.openclawCronRunsDir, 'noise.jsonl'),
      [
        JSON.stringify({ action: 'started', ts: 1776585694760, summary: 'not finished yet' }),
        JSON.stringify({ action: 'finished', ts: 1776585694760, summary: '' }),
        JSON.stringify({ action: 'finished', summary: 'missing timestamp' }),
        '{bad-json}',
      ].join('\n'),
      'utf8',
    );

    const collector = new OpenClawCollector(config);
    const events = await collector.collect(new Date('2026-04-19T00:00:00.000Z'));

    assert.equal(events.length, 0);
  });
});
