import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { GitCollector } from '../src/collectors/shell';
import { UrchinConfig } from '../src/core/config';

async function withTempRepo(run: (config: UrchinConfig, repoPath: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-git-'));
  const reposRoot = path.join(root, 'dev');
  const repoPath = path.join(reposRoot, 'urchin');

  const config: UrchinConfig = {
    archiveIndexPath: path.join(root, 'vault', '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(root, 'vault', '40-archive', 'urchin'),
    claudeHistoryFile: path.join(root, '.claude', 'history.jsonl'),
    copilotSessionRoot: path.join(root, '.copilot', 'session-state'),
    geminiTmpRoot: path.join(root, '.gemini', 'tmp'),
    inboxCapturePath: path.join(root, 'vault', '00-inbox', 'urchin-capture.md'),
    intakeRoot: path.join(root, 'intake'),
    openclawCommandsLog: path.join(root, '.openclaw', 'logs', 'commands.log'),
    projectAliasPath: path.join(root, '.config', 'urchin', 'project-aliases.json'),
    reposRoots: [reposRoot],
    shellHistoryFile: path.join(root, '.bash_history'),
    statePath: path.join(root, '.state', 'urchin.json'),
    vaultRoot: path.join(root, 'vault'),
  };

  await fs.ensureDir(repoPath);
  execFileSync('git', ['init'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'samhcharles'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'sam@example.com'], { cwd: repoPath, stdio: 'ignore' });
  await fs.writeFile(path.join(repoPath, 'README.md'), '# Urchin\n', 'utf8');
  execFileSync('git', ['add', 'README.md'], { cwd: repoPath, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'feat: initial archive hardening'], {
    cwd: repoPath,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2026-04-21T08:00:00.000Z',
      GIT_COMMITTER_DATE: '2026-04-21T08:00:00.000Z',
    },
  });

  try {
    await run(config, repoPath);
  } finally {
    await fs.remove(root);
  }
}

test('GitCollector collects commits without shell interpolation', async () => {
  await withTempRepo(async (config) => {
    const collector = new GitCollector(config);
    const events = await collector.collect(new Date('2026-04-21T07:00:00.000Z'));

    assert.equal(events.length, 1);
    assert.equal(events[0]?.source, 'git');
    assert.equal(events[0]?.provenance.repo, 'urchin');
    assert.match(events[0]?.summary ?? '', /initial archive hardening/);
  });
});
