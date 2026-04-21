import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { ClaudeCollector } from '../src/collectors/claude';
import { UrchinConfig } from '../src/core/config';

async function withTempConfig(run: (config: UrchinConfig) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-claude-'));
  const config: UrchinConfig = {
    archiveIndexPath: path.join(root, 'vault', '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(root, 'vault', '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(root, 'vault', '00-inbox', 'urchin-capture.md'),
    intakeRoot: path.join(root, 'intake'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    reposRoots: [path.join(root, 'dev')],
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    vaultRoot: path.join(root, 'vault'),
  };

  try {
    await run(config);
  } finally {
    await fs.remove(root);
  }
}

test('ClaudeCollector ignores low-signal slash commands and duplicated history sessions', async () => {
  await withTempConfig(async (config) => {
    const projectsDir = path.join(path.dirname(config.claudeHistoryFile), 'projects', 'demo');
    await fs.ensureDir(projectsDir);
    await fs.ensureDir(path.dirname(config.claudeHistoryFile));

    await fs.writeFile(
      config.claudeHistoryFile,
      [
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-04-21T08:00:00.000Z',
          display: 'Useful history event',
          project: 'urchin',
        }),
        JSON.stringify({
          sessionId: 'session-2',
          timestamp: '2026-04-21T08:01:00.000Z',
          display: '/clear',
          project: 'urchin',
        }),
      ].join('\n'),
      'utf8',
    );

    await fs.writeFile(
      path.join(projectsDir, 'session.jsonl'),
      [
        JSON.stringify({
          sessionId: 'session-1',
          timestamp: '2026-04-21T08:00:00.000Z',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Useful project transcript event' }],
          },
        }),
        JSON.stringify({
          sessionId: 'session-3',
          timestamp: '2026-04-21T08:02:00.000Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: '<command-name>/clear</command-name>' }],
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const collector = new ClaudeCollector(config);
    const events = await collector.collect(new Date('2026-04-21T07:00:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events.some((entry) => entry.content === 'Useful history event'), false);
    assert.equal(events.some((entry) => entry.content === 'Useful project transcript event'), true);
    assert.equal(events.some((entry) => entry.content === '/clear'), false);
  });
});
