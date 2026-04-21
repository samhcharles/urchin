import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { UrchinConfig } from '../src/core/config';
import { buildDoctorReport } from '../src/core/doctor';
import { saveState } from '../src/core/state';

async function withTempConfig(run: (config: UrchinConfig, root: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-doctor-'));
  const vaultRoot = path.join(root, 'vault');
  const config: UrchinConfig = {
    archiveIndexPath: path.join(vaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(vaultRoot, '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(vaultRoot, '00-inbox', 'urchin-capture.md'),
    intakeRoot: path.join(root, 'intake'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    projectAliasPath: path.join(root, '.config', 'urchin', 'project-aliases.json'),
    reposRoots: [path.join(root, 'dev'), path.join(root, 'repos')],
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    vaultRoot,
  };

  await fs.ensureDir(config.archiveRoot);
  await fs.ensureDir(config.copilotSessionRoot);
  await fs.ensureDir(config.intakeRoot);
  await fs.ensureDir(config.reposRoots[0]);
  await fs.ensureDir(path.join(config.reposRoots[0], 'urchin', '.git'));
  await fs.ensureDir(path.dirname(config.claudeHistoryFile));
  await fs.writeFile(config.claudeHistoryFile, '', 'utf8');
  await fs.writeFile(config.shellHistoryFile, 'echo hello\n', 'utf8');
  await saveState(config.statePath, {
    lastSuccessfulSyncAt: '2026-04-21T08:00:00.000Z',
    lastSyncStartedAt: '2026-04-21T09:00:00.000Z',
    sources: {
      copilot: {
        eventCount: 4,
        lastRunAt: '2026-04-21T09:00:00.000Z',
        lastSuccessAt: '2026-04-21T09:00:00.000Z',
      },
      gemini: {
        eventCount: 0,
        lastError: 'gemini root missing',
        lastRunAt: '2026-04-21T09:00:00.000Z',
      },
    },
  });

  try {
    await run(config, root);
  } finally {
    await fs.remove(root);
  }
}

test('buildDoctorReport distinguishes reachable shipped collectors from planned spikes', async () => {
  await withTempConfig(async (config) => {
    const report = await buildDoctorReport(config, () => new Date('2026-04-21T10:00:00.000Z'));

    assert.equal(report.generatedAt, '2026-04-21T10:00:00.000Z');
    assert.equal(report.vault.writable, true);
    assert.equal(report.sync.lastSuccessfulSyncAt, '2026-04-21T08:00:00.000Z');
    assert.equal(report.sync.connectedSourceCount >= 1, true);

    const copilot = report.sources.find((source) => source.source === 'copilot');
    assert.ok(copilot);
    assert.equal(copilot.status, 'ready');
    assert.equal(copilot.runtime?.eventCount, 4);

    const claude = report.sources.find((source) => source.source === 'claude');
    assert.ok(claude);
    assert.equal(claude.status, 'partial');

    const git = report.sources.find((source) => source.source === 'git');
    assert.ok(git);
    assert.equal(git.details?.discoveredRepos, 1);

    const vscodeSpike = report.spikes.find((spike) => spike.id === 'editor-vscode');
    assert.ok(vscodeSpike);
    assert.equal(vscodeSpike.status, 'planned');
  });
});
