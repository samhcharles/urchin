import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { promoteEvents } from '../src/obsidian/promote';
import { Linker } from '../src/synthesis/linker';
import { UrchinEvent } from '../src/types';

async function withTempVault(run: (config: UrchinConfig, linker: Linker) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-promote-'));
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
  await fs.ensureDir(path.join(vaultRoot, '30-resources', 'ai'));
  await fs.writeFile(path.join(vaultRoot, '10-projects', 'openclaw.md'), '# OpenClaw\n', 'utf8');
  await fs.writeFile(path.join(vaultRoot, '30-resources', 'ai', 'urchin.md'), '# Urchin\n', 'utf8');

  const linker = new Linker(vaultRoot, config.projectAliasPath);
  await linker.initialize();

  try {
    await run(config, linker);
  } finally {
    await fs.remove(root);
  }
}

function event(overrides: Partial<UrchinEvent> = {}): UrchinEvent {
  return {
    id: 'evt-1',
    kind: 'agent',
    source: 'copilot',
    timestamp: '2026-04-21T08:00:00.000Z',
    summary: 'Completed a repo audit',
    content: 'Completed a repo audit',
    tags: [],
    metadata: {},
    provenance: {
      adapter: 'copilot-session-state',
      location: '/tmp/events.jsonl',
      repo: 'openclaw',
      scope: 'local',
      sessionId: 'session-1',
    },
    ...overrides,
  };
}

test('promoteEvents updates project, resource, and decision surfaces with managed sections', async () => {
  await withTempVault(async (config, linker) => {
    const written = await promoteEvents(config, linker, [
      event(),
      event({
        id: 'evt-2',
        summary: 'Choose explicit promotion over silent rewriting',
        tags: ['decision'],
      }),
    ]);

    assert.equal(written.promotedPaths.length, 3);

    const [project, resource, decisions] = await Promise.all([
      fs.readFile(path.join(config.vaultRoot, '10-projects', 'openclaw.md'), 'utf8'),
      fs.readFile(path.join(config.vaultRoot, '30-resources', 'ai', 'urchin.md'), 'utf8'),
      fs.readFile(path.join(config.vaultRoot, '30-resources', 'decisions.md'), 'utf8'),
    ]);

    assert.match(project, /## Urchin Context/);
    assert.match(project, /Completed a repo audit/);
    assert.match(resource, /## Promoted Sync Signals/);
    assert.match(resource, /\[\[openclaw\]\]/);
    assert.match(decisions, /## Urchin Decisions/);
    assert.match(decisions, /Choose explicit promotion over silent rewriting/);
  });
});
