import * as fs from 'fs-extra';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

function isLowSignalCommand(command: string, config: UrchinConfig): boolean {
  const trimmed = command.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.length < config.shellMinCommandLength) {
    return true;
  }

  return config.shellIgnorePrefixes.some((prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `));
}

function resolveGitAuthor(config: UrchinConfig, repoPath: string): string | undefined {
  if (config.gitAuthor) {
    return config.gitAuthor;
  }

  try {
    const author = execFileSync('git', ['config', 'user.name'], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return author || undefined;
  } catch {
    return undefined;
  }
}

export class ShellCollector implements Collector {
  name: 'shell' = 'shell';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const historyFile = this.config.shellHistoryFile;
    if (!(await fs.pathExists(historyFile))) return [];

    const stats = await fs.stat(historyFile);
    if (since && stats.mtime < since) return [];

    const rawData = await fs.readFile(historyFile, 'utf-8');
    const lines = rawData
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !isLowSignalCommand(line, this.config))
      .slice(-20);

    if (lines.length === 0) {
      return [];
    }

    return [{
      id: 'shell-' + stats.mtime.getTime(),
      kind: 'activity',
      source: 'shell',
      timestamp: stats.mtime.toISOString(),
      summary: `Recent shell commands (${lines.length})`,
      content: lines.join('\n'),
      tags: ['shell', 'history'],
      metadata: { lastCommands: true, filteredCommandCount: lines.length },
      provenance: {
        adapter: 'shell-history',
        location: historyFile,
        scope: 'local',
      },
    }];
  }
}

export class GitCollector implements Collector {
  name: 'git' = 'git';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    let events: UrchinEvent[] = [];

    for (const reposDir of this.config.reposRoots) {
      if (!(await fs.pathExists(reposDir))) {
        continue;
      }

      const repos = await fs.readdir(reposDir);
      for (const repo of repos) {
        const repoPath = path.join(reposDir, repo);
        const gitDir = path.join(repoPath, '.git');
        if (await fs.pathExists(gitDir)) {
          try {
            const author = resolveGitAuthor(this.config, repoPath);
            if (!author) {
              continue;
            }

            const gitArgs = [
              'log',
              `--author=${author}`,
              `--since=${since ? since.toISOString() : '24 hours ago'}`,
              '--pretty=format:%h|%aI|%s',
            ];
            const log = execFileSync('git', gitArgs, {
              cwd: repoPath,
              encoding: 'utf-8',
              stdio: ['ignore', 'pipe', 'ignore'],
            });

            const lines = log.split('\n').filter(l => l.trim().length > 0);
            for (const line of lines) {
              const parts = line.split('|');
              if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
                events.push({
                  id: `git-${repo}-${parts[0]}`,
                  kind: 'code',
                  source: 'git',
                  timestamp: parts[1],
                  summary: sanitize(parts[2], 140),
                  content: parts[2],
                  tags: ['git', 'commit'],
                  metadata: { repo, hash: parts[0] },
                  provenance: {
                    adapter: 'git-log',
                    location: repoPath,
                    scope: 'local',
                    repo,
                  },
                });
              }
            }
          } catch {
            // Skip repos without matching commits.
          }
        }
      }
    }

    return events;
  }
}
