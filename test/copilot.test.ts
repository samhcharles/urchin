import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { CopilotCollector } from '../src/collectors/copilot';
import { UrchinConfig } from '../src/core/config';
import { AsyncAgentMetadata } from '../src/types';

async function withTempConfig(run: (config: UrchinConfig) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-copilot-'));
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

test('CopilotCollector captures background agent launches and terminal results', async () => {
  await withTempConfig(async (config) => {
    const sessionDir = path.join(config.copilotSessionRoot, 'session-1');
    await fs.ensureDir(sessionDir);
    await fs.writeFile(
      path.join(sessionDir, 'events.jsonl'),
      [
        JSON.stringify({
          type: 'tool.execution_start',
          timestamp: '2026-04-21T08:00:00.000Z',
          data: {
            toolCallId: 'call-task',
            toolName: 'task',
            arguments: {
              description: 'Reviewing audit target',
              agent_type: 'code-review',
              mode: 'background',
              model: 'claude-sonnet-4.5',
              name: 'urchin-blunt-audit',
              prompt: 'Audit the repo',
            },
          },
        }),
        JSON.stringify({
          type: 'tool.execution_complete',
          timestamp: '2026-04-21T08:00:01.000Z',
          data: {
            toolCallId: 'call-task',
            interactionId: 'interaction-1',
            success: true,
            result: {
              content: 'Agent started in background with agent_id: urchin-blunt-audit. You can use read_agent tool.',
            },
          },
        }),
        JSON.stringify({
          type: 'tool.execution_start',
          timestamp: '2026-04-21T08:05:00.000Z',
          data: {
            toolCallId: 'call-read',
            toolName: 'read_agent',
            arguments: {
              agent_id: 'urchin-blunt-audit',
              wait: true,
              timeout: 10,
            },
          },
        }),
        JSON.stringify({
          type: 'tool.execution_complete',
          timestamp: '2026-04-21T08:05:01.000Z',
          data: {
            toolCallId: 'call-read',
            interactionId: 'interaction-2',
            success: true,
            result: {
              content:
                'Agent completed. agent_id: urchin-blunt-audit, agent_type: code-review, status: completed, description: Reviewing audit target\n\n# URCHIN AUDIT REPORT\nStrong foundation.',
            },
          },
        }),
      ].join('\n'),
      'utf8',
    );

    const collector = new CopilotCollector(config);
    const events = await collector.collect(new Date('2026-04-21T07:00:00.000Z'));
    const launched = events[0]?.metadata.agent as AsyncAgentMetadata | undefined;
    const completed = events[1]?.metadata.agent as AsyncAgentMetadata | undefined;

    assert.equal(events.length, 2);
    assert.equal(events[0]?.kind, 'agent');
    assert.equal(launched?.status, 'launched');
    assert.equal(launched?.title, 'Reviewing audit target');
    assert.equal(events[1]?.kind, 'agent');
    assert.equal(completed?.status, 'completed');
    assert.match(events[1]?.content ?? '', /URCHIN AUDIT REPORT/);
    assert.equal(events[1]?.provenance.sessionId, 'session-1');
  });
});
