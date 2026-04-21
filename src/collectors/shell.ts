import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { Collector, UrchinEvent } from '../types';

export class ShellCollector implements Collector {
  name: 'shell' = 'shell';

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const historyFile = path.join(os.homedir(), '.bash_history');
    if (!(await fs.pathExists(historyFile))) return [];

    const stats = await fs.stat(historyFile);
    if (since && stats.mtime < since) return [];

    const rawData = await fs.readFile(historyFile, 'utf-8');
    const lines = rawData.split('\n').filter(l => l.trim().length > 0).slice(-20);

    return [{
      id: 'shell-' + stats.mtime.getTime(),
      source: 'shell',
      timestamp: stats.mtime.toISOString(),
      content: lines.join('\n'),
      metadata: { lastCommands: true }
    }];
  }
}

export class GitCollector implements Collector {
  name: 'git' = 'git';

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const reposDir = path.join(os.homedir(), 'repos');
    if (!(await fs.pathExists(reposDir))) return [];

    const repos = await fs.readdir(reposDir);
    let events: UrchinEvent[] = [];

    const dateStr = since ? since.toISOString() : '24 hours ago';

    for (const repo of repos) {
      const repoPath = path.join(reposDir, repo);
      const gitDir = path.join(repoPath, '.git');
      if (await fs.pathExists(gitDir)) {
        try {
          const log = execSync(`git log --author="samhcharles" --since="${dateStr}" --pretty=format:"%h|%aI|%s"`, {
            cwd: repoPath,
            encoding: 'utf-8'
          });

          const lines = log.split('\n').filter(l => l.trim().length > 0);
          for (const line of lines) {
            const parts = line.split('|');
            if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
              events.push({
                id: `git-${repo}-${parts[0]}`,
                source: 'git',
                timestamp: parts[1],
                content: parts[2],
                metadata: { repo, hash: parts[0] }
              });
            }
          }
        } catch (err) {
          // Skip errors
        }
      }
    }

    return events;
  }
}
