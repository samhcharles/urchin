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
    reposRoots: [path.join(root, 'dev'), path.join(root, 'repos')],
    shellIgnorePrefixes: ['cd', 'ls'],
    shellMinCommandLength: 8,
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    timerCadence: '5m',
    vaultRoot,
    vscodeWorkspaceAliasesPath: path.join(root, '.config', 'urchin', 'vscode-workspaces.json'),
    vscodeEventsPath: path.join(root, '.local', 'share', 'urchin', 'editors', 'vscode', 'events.jsonl'),
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
      lastPromotionNotReason: 'no project-tagged or decision events met promotion rules',
      lastSyncCollectedCount: 8,
      lastSyncDedupedCount: 6,
      lastSyncPromotedCount: 2,
      lastSuccessfulSyncAt: '2026-04-21T08:00:00.000Z',
      lastSyncStartedAt: '2026-04-21T09:00:00.000Z',
      lastSyncWrittenCount: 6,
      sources: {
        copilot: {
          collectedCount: 4,
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
  await withTempConfig(async (config, root) => {
    await fs.ensureDir(path.join(root, '.config', 'urchin'));
    await fs.ensureDir(path.join(root, '.config', 'systemd', 'user'));
    await fs.writeFile(path.join(root, '.config', 'urchin', 'personal.env'), 'URCHIN_VAULT_ROOT="/tmp/vault"\n', 'utf8');
    await fs.writeFile(path.join(root, '.config', 'systemd', 'user', 'urchin.service'), '[Service]\n', 'utf8');
    await fs.writeFile(path.join(root, '.config', 'systemd', 'user', 'urchin.timer'), '[Timer]\n', 'utf8');
    await fs.ensureDir(path.join(config.vaultRoot, '30-resources', 'ai'));
    await fs.writeFile(path.join(config.vaultRoot, '30-resources', 'ai', 'urchin-personal.md'), '# Personal\n', 'utf8');
    await fs.ensureDir(path.dirname(config.openclawCommandsLog));
    await fs.writeFile(config.openclawCommandsLog, '', 'utf8');
    await fs.ensureDir(config.openclawCronRunsDir);
    await fs.writeFile(path.join(config.openclawCronRunsDir, 'daily-brief.jsonl'), '{}\n', 'utf8');

    const report = await buildDoctorReport(
      config,
      () => new Date('2026-04-21T10:00:00.000Z'),
      { homeRoot: root },
    );

    assert.equal(report.generatedAt, '2026-04-21T10:00:00.000Z');
    assert.equal(report.vault.writable, true);
    assert.equal(report.sync.lastPromotionNotReason, 'no project-tagged or decision events met promotion rules');
    assert.equal(report.sync.lastSyncCollectedCount, 8);
    assert.equal(report.sync.lastSyncDedupedCount, 6);
    assert.equal(report.sync.lastSyncPromotedCount, 2);
    assert.equal(report.sync.lastSuccessfulSyncAt, '2026-04-21T08:00:00.000Z');
    assert.equal(report.sync.connectedSourceCount >= 1, true);
    assert.equal(report.sync.lastSyncWrittenCount, 6);
    assert.equal(report.automation.envExists, true);
    assert.equal(report.automation.serviceInstalled, true);
    assert.equal(report.automation.timerInstalled, true);
    assert.equal(report.automation.personalNoteExists, true);

    const copilot = report.sources.find((source) => source.source === 'copilot');
    assert.ok(copilot);
    assert.equal(copilot.status, 'ready');
    assert.equal(copilot.runtime?.collectedCount, 4);
    assert.equal(copilot.runtime?.eventCount, 4);

    const claude = report.sources.find((source) => source.source === 'claude');
    assert.ok(claude);
    assert.equal(claude.status, 'partial');

    const openclaw = report.sources.find((source) => source.source === 'openclaw');
    assert.ok(openclaw);
    assert.equal(openclaw.status, 'ready');
    assert.equal(openclaw.details?.cronRunFiles, 1);

    const git = report.sources.find((source) => source.source === 'git');
    assert.ok(git);
    assert.equal(git.details?.discoveredRepos, 1);

    assert.equal(report.sync.shippedSourceCount, 9);

    const vscodeSpike = report.spikes.find((spike) => spike.id === 'editor-vscode');
    assert.ok(vscodeSpike);
    assert.equal(vscodeSpike.status, 'shipped');

    const agentSpike = report.spikes.find((spike) => spike.id === 'agent-bridge');
    assert.ok(agentSpike);
    assert.equal(agentSpike.status, 'shipped');
  });
});
