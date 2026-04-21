import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Linker } from '../synthesis/linker';
import { UrchinEvent } from '../types';

function buildFrontmatter(pairs: Array<[string, string]>): string {
  const lines = ['---'];
  for (const [key, value] of pairs) {
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function eventDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function eventTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function archivePath(config: UrchinConfig, day: string): string {
  const [year, month] = day.split('-');
  return path.join(config.archiveRoot, 'daily', year, month, `${day}.md`);
}

function relativeToVault(config: UrchinConfig, absolutePath: string): string {
  return path.relative(config.vaultRoot, absolutePath).replace(/\\/g, '/');
}

function sourceSummary(events: UrchinEvent[]): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.source, (counts.get(event.source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `- \`${name}\` x${count}`)
    .join('\n');
}

export async function appendManualCapture(config: UrchinConfig, linker: Linker, text: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const linked = linker.link(sanitize(text, 1000));
  const entry = `- [ ] ${timestamp}: ${linked} #urchin-capture\n`;
  await fs.ensureDir(path.dirname(config.inboxCapturePath));
  await fs.appendFile(config.inboxCapturePath, entry, 'utf8');
}

export async function writeArchive(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<string[]> {
  const grouped = new Map<string, UrchinEvent[]>();

  for (const event of events) {
    const day = eventDay(event.timestamp);
    const current = grouped.get(day) ?? [];
    current.push(event);
    grouped.set(day, current);
  }

  const writtenPaths: string[] = [];

  for (const [day, dayEvents] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    dayEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const targetPath = archivePath(config, day);
    const body = [
      buildFrontmatter([
        ['tags', '[archive, urchin, timeline]'],
        ['day', day],
      ]),
      `# Urchin Timeline — ${day}`,
      '## Sources\n' + sourceSummary(dayEvents),
      '## Events\n' + dayEvents.map((event) => {
        const lines = [
          `### ${eventTime(event.timestamp)} — ${event.source} / ${event.kind}`,
          linker.link(sanitize(event.content)),
          `- **Summary:** ${sanitize(event.summary, 240)}`,
          `- **Provenance:** \`${sanitize(event.provenance.location, 220)}\``,
        ];

        if (event.provenance.repo) {
          lines.push(`- **Repo:** [[${sanitize(event.provenance.repo, 120)}]]`);
        }

        if (event.provenance.sessionId) {
          lines.push(`- **Session:** \`${sanitize(event.provenance.sessionId, 120)}\``);
        }

        return lines.join('\n');
      }).join('\n\n---\n\n'),
    ].join('\n\n') + '\n';

    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, body, 'utf8');
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

export async function writeArchiveIndex(config: UrchinConfig, notePaths: string[]): Promise<void> {
  const content = [
    buildFrontmatter([
      ['tags', '[archive, urchin, index]'],
    ]),
    '# Urchin Archive',
    'Daily timeline notes generated from local workflow and AI activity.',
    '## Notes',
    ...notePaths
      .sort((a, b) => b.localeCompare(a))
      .map((absolutePath) => {
        const day = path.basename(absolutePath, '.md');
        return `- [[${relativeToVault(config, absolutePath)}|Urchin Timeline — ${day}]]`;
      }),
  ].join('\n\n') + '\n';

  await fs.ensureDir(path.dirname(config.archiveIndexPath));
  await fs.writeFile(config.archiveIndexPath, content, 'utf8');
}
