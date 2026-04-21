import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { writeFileAtomic } from '../core/io';
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

function projectArchivePath(config: UrchinConfig, project: string, day: string): string {
  const [year, month] = day.split('-');
  return path.join(config.archiveRoot, 'projects', project, year, month, `${day}.md`);
}

function triagePath(config: UrchinConfig, day: string): string {
  const [year, month] = day.split('-');
  return path.join(config.archiveRoot, 'triage', year, month, `${day}.md`);
}

export function relativeToVault(config: UrchinConfig, absolutePath: string): string {
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

function projectSummary(events: UrchinEvent[], linker: Linker): string {
  const counts = new Map<string, number>();
  for (const event of events) {
    const project = deriveProjectLabel(event, linker);
    if (!project) {
      continue;
    }
    counts.set(project, (counts.get(project) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `- [[${name}]] x${count}`)
    .join('\n');
}

function slugifyProject(project: string): string {
  return project
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function deriveProject(event: UrchinEvent): string | undefined {
  if (event.provenance.repo) {
    return sanitize(event.provenance.repo, 120);
  }

  const project = typeof event.metadata.project === 'string' ? event.metadata.project : undefined;
  if (project?.trim()) {
    return sanitize(path.basename(project), 120);
  }

  const cwd = typeof event.metadata.cwd === 'string' ? event.metadata.cwd : undefined;
  if (cwd?.trim()) {
    const derived = path.basename(cwd);
    if (derived && derived !== '.' && derived !== path.sep) {
      return sanitize(derived, 120);
    }
  }

  const workspacePath = typeof event.metadata.workspacePath === 'string' ? event.metadata.workspacePath : undefined;
  if (workspacePath?.trim()) {
    const derived = path.basename(workspacePath);
    if (derived && derived !== '.' && derived !== path.sep) {
      return sanitize(derived, 120);
    }
  }

  return undefined;
}

export function deriveProjectLabel(event: UrchinEvent, linker: Linker): string | undefined {
  const project = deriveProject(event);
  if (!project) {
    return undefined;
  }

  return linker.resolveProjectName(project) ?? project;
}

function renderEvent(linker: Linker, event: UrchinEvent): string {
  const lines = [
    `### ${eventTime(event.timestamp)} — ${event.source} / ${event.kind}`,
    linker.link(sanitize(event.content)),
    `- **Summary:** ${sanitize(event.summary, 240)}`,
    `- **Provenance:** \`${sanitize(event.provenance.location, 220)}\``,
  ];

  const project = deriveProjectLabel(event, linker);
  if (project) {
    lines.push(`- **Project:** [[${project}]]`);
  }

  if (event.provenance.repo) {
    lines.push(`- **Repo:** [[${sanitize(event.provenance.repo, 120)}]]`);
  }

  if (event.provenance.sessionId) {
    lines.push(`- **Session:** \`${sanitize(event.provenance.sessionId, 120)}\``);
  }

  const editor = typeof event.metadata.editor === 'string' ? event.metadata.editor : undefined;
  if (editor) {
    lines.push(`- **Editor:** \`${sanitize(editor, 120)}\``);
  }

  const workspacePath = typeof event.metadata.workspacePath === 'string' ? event.metadata.workspacePath : undefined;
  if (workspacePath) {
    lines.push(`- **Workspace:** \`${sanitize(workspacePath, 220)}\``);
  }

  const filePath = typeof event.metadata.filePath === 'string' ? event.metadata.filePath : undefined;
  if (filePath) {
    lines.push(`- **File:** \`${sanitize(filePath, 220)}\``);
  }

  return lines.join('\n');
}

async function writeDailyTimelines(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<string[]> {
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
    const projectLines = projectSummary(dayEvents, linker);
    const body = [
      buildFrontmatter([
        ['tags', '[archive, urchin, timeline]'],
        ['day', day],
      ]),
      `# Urchin Timeline — ${day}`,
      '## Sources\n' + sourceSummary(dayEvents),
      projectLines ? '## Projects\n' + projectLines : '',
      '## Events\n' + dayEvents.map((event) => renderEvent(linker, event)).join('\n\n---\n\n'),
    ]
      .filter(Boolean)
      .join('\n\n') + '\n';

    await writeFileAtomic(targetPath, body);
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

async function writeProjectTimelines(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<string[]> {
  const grouped = new Map<string, UrchinEvent[]>();

  for (const event of events) {
    const project = deriveProjectLabel(event, linker);
    if (!project) {
      continue;
    }
    const day = eventDay(event.timestamp);
    const key = `${project}|${day}`;
    const current = grouped.get(key) ?? [];
    current.push(event);
    grouped.set(key, current);
  }

  const writtenPaths: string[] = [];

  for (const [key, projectEvents] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [project, day] = key.split('|');
    if (!project || !day) {
      continue;
    }

    projectEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const targetPath = projectArchivePath(config, slugifyProject(project), day);
    const body = [
      buildFrontmatter([
        ['tags', '[archive, urchin, project-activity]'],
        ['day', day],
        ['project', `"${project}"`],
      ]),
      `# Urchin Project Activity — ${project} — ${day}`,
      '## Sources\n' + sourceSummary(projectEvents),
      '## Events\n' + projectEvents.map((event) => renderEvent(linker, event)).join('\n\n---\n\n'),
    ].join('\n\n') + '\n';

    await writeFileAtomic(targetPath, body);
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

async function writeTriageNotes(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<string[]> {
  const grouped = new Map<string, UrchinEvent[]>();

  for (const event of events) {
    const project = deriveProjectLabel(event, linker);
    if ((event.kind !== 'capture' && event.source !== 'browser' && event.source !== 'manual') || project) {
      continue;
    }

    const day = eventDay(event.timestamp);
    const current = grouped.get(day) ?? [];
    current.push(event);
    grouped.set(day, current);
  }

  const writtenPaths: string[] = [];

  for (const [day, triageEvents] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    triageEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const targetPath = triagePath(config, day);
    const body = [
      buildFrontmatter([
        ['tags', '[archive, urchin, triage]'],
        ['day', day],
      ]),
      `# Urchin Triage — ${day}`,
      'Review these captures before promoting them into durable notes.',
      '## Sources\n' + sourceSummary(triageEvents),
      '## Candidates\n' + triageEvents.map((event) => renderEvent(linker, event)).join('\n\n---\n\n'),
    ].join('\n\n') + '\n';

    await writeFileAtomic(targetPath, body);
    writtenPaths.push(targetPath);
  }

  return writtenPaths;
}

export async function appendManualCapture(config: UrchinConfig, linker: Linker, text: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const linked = linker.link(sanitize(text, 1000));
  const entry = `- [ ] ${timestamp}: ${linked} #urchin-capture\n`;
  await fs.ensureDir(path.dirname(config.inboxCapturePath));
  await fs.appendFile(config.inboxCapturePath, entry, 'utf8');
}

export async function writeArchive(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<string[]> {
  const dailyPaths = await writeDailyTimelines(config, linker, events);
  const projectPaths = await writeProjectTimelines(config, linker, events);
  const triagePaths = await writeTriageNotes(config, linker, events);
  return [...dailyPaths, ...projectPaths, ...triagePaths];
}

async function listArchiveNotes(config: UrchinConfig, pattern: string): Promise<string[]> {
  return glob(pattern, {
    cwd: config.archiveRoot,
    absolute: true,
  });
}

export async function writeArchiveIndex(config: UrchinConfig): Promise<void> {
  const [dailyNotes, projectNotes, triageNotes] = await Promise.all([
    listArchiveNotes(config, 'daily/**/*.md'),
    listArchiveNotes(config, 'projects/**/*.md'),
    listArchiveNotes(config, 'triage/**/*.md'),
  ]);

  function noteLinks(paths: string[], labelFor: (absolutePath: string) => string): string[] {
    return paths
      .sort((a, b) => b.localeCompare(a))
      .map((absolutePath) => {
        return `- [[${relativeToVault(config, absolutePath)}|${labelFor(absolutePath)}]]`;
      });
  }

  const content = [
    buildFrontmatter([
      ['tags', '[archive, urchin, index]'],
    ]),
    '# Urchin Archive',
    'Archive notes generated from local workflow and AI activity.',
    '## Daily Timelines',
    ...(dailyNotes.length > 0
      ? noteLinks(dailyNotes, (absolutePath) => `Urchin Timeline — ${path.basename(absolutePath, '.md')}`)
      : ['- None yet']),
    '## Project Activity',
    ...(projectNotes.length > 0
      ? noteLinks(projectNotes, (absolutePath) => {
          const relative = path.relative(path.join(config.archiveRoot, 'projects'), absolutePath).replace(/\\/g, '/');
          const [project, _year, _month, fileName] = relative.split('/');
          const day = fileName?.replace(/\.md$/, '');
          return `Project Activity — ${project ?? 'unknown'} — ${day ?? 'unknown-day'}`;
        })
      : ['- None yet']),
    '## Triage',
    ...(triageNotes.length > 0
      ? noteLinks(triageNotes, (absolutePath) => `Urchin Triage — ${path.basename(absolutePath, '.md')}`)
      : ['- None yet']),
  ].join('\n\n') + '\n';

  await writeFileAtomic(config.archiveIndexPath, content);
}
