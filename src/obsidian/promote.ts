import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinConfig } from '../core/config';
import { writeFileAtomic } from '../core/io';
import { sanitize } from '../core/redaction';
import { Linker } from '../synthesis/linker';
import { UrchinEvent } from '../types';
import { deriveProjectLabel, relativeToVault } from './writer';

const PROJECT_SECTION_START = '<!-- URCHIN:PROJECT_CONTEXT:START -->';
const PROJECT_SECTION_END = '<!-- URCHIN:PROJECT_CONTEXT:END -->';
const RESOURCE_SECTION_START = '<!-- URCHIN:RESOURCE_CONTEXT:START -->';
const RESOURCE_SECTION_END = '<!-- URCHIN:RESOURCE_CONTEXT:END -->';
const DECISION_SECTION_START = '<!-- URCHIN:DECISIONS:START -->';
const DECISION_SECTION_END = '<!-- URCHIN:DECISIONS:END -->';

function eventDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function eventArchivePath(config: UrchinConfig, event: UrchinEvent, project: string | undefined): string {
  const day = eventDay(event.timestamp);
  const [year, month] = day.split('-');
  if (project) {
    const slug = project
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return path.join(config.archiveRoot, 'projects', slug, year ?? '', month ?? '', `${day}.md`);
  }

  return path.join(config.archiveRoot, 'daily', year ?? '', month ?? '', `${day}.md`);
}

function eventLine(config: UrchinConfig, event: UrchinEvent, project: string | undefined): string {
  const archivePath = eventArchivePath(config, event, project);
  const archiveLink = `[[${relativeToVault(config, archivePath)}|archive]]`;
  const projectFragment = project ? ` [[${project}]]` : '';
  return `- ${event.timestamp} — ${event.source} / ${event.kind}${projectFragment} — ${sanitize(event.summary, 180)} (${archiveLink})`;
}

function replaceManagedSection(content: string, heading: string, body: string, startMarker: string, endMarker: string): string {
  const section = `${heading}\n${startMarker}\n${body}\n${endMarker}`;
  const pattern = new RegExp(`${escapeRegExp(heading)}\\n${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`);
  if (pattern.test(content)) {
    return content.replace(pattern, section);
  }

  const trimmed = content.trimEnd();
  return `${trimmed}${trimmed ? '\n\n' : ''}${section}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isProjectPromotable(event: UrchinEvent, linker: Linker): boolean {
  return Boolean(deriveProjectLabel(event, linker)) && (
    event.kind === 'agent' ||
    event.kind === 'code' ||
    event.source === 'vscode'
  );
}

function isDecisionEvent(event: UrchinEvent): boolean {
  return event.tags.includes('decision') || event.metadata.decision === true;
}

export interface PromotionSummary {
  decisions: number;
  projectEvents: number;
  projectNotes: number;
  resourceNotes: number;
}

export interface PromotionResult {
  promotedCount: number;
  promotedPaths: string[];
  summary: PromotionSummary;
  whyNot?: string;
}

async function writeProjectPromotions(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<{ paths: string[]; projectEventCount: number }> {
  const byProject = new Map<string, UrchinEvent[]>();

  for (const event of events) {
    if (!isProjectPromotable(event, linker)) {
      continue;
    }

    const project = deriveProjectLabel(event, linker);
    if (!project) {
      continue;
    }

    const current = byProject.get(project) ?? [];
    current.push(event);
    byProject.set(project, current);
  }

  const writtenPaths: string[] = [];
  const projectEventCount = [...byProject.values()].reduce((count, projectEvents) => count + projectEvents.length, 0);

  for (const [project, projectEvents] of byProject.entries()) {
    const notePath = path.join(config.vaultRoot, '10-projects', `${project}.md`);
    if (!(await fs.pathExists(notePath))) {
      continue;
    }

    const existing = await fs.readFile(notePath, 'utf8');
    const recent = projectEvents
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5)
      .map((event) => eventLine(config, event, project))
      .join('\n');
    const next = replaceManagedSection(
      existing,
      '## Urchin Context',
      [
        '- Promoted conservatively from synced activity with provenance preserved.',
        '- Recent synced signals:',
        recent,
      ].join('\n'),
      PROJECT_SECTION_START,
      PROJECT_SECTION_END,
    );

    await writeFileAtomic(notePath, next);
    writtenPaths.push(notePath);
  }

  return { paths: writtenPaths, projectEventCount };
}

async function writeResourcePromotion(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<{ paths: string[]; promotableCount: number }> {
  const promotable = events
    .filter((event) => isProjectPromotable(event, linker) || isDecisionEvent(event))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
  if (promotable.length === 0) {
    return { paths: [], promotableCount: 0 };
  }

  const resourcePath = path.join(config.vaultRoot, '30-resources', 'ai', 'urchin.md');
  const existing = (await fs.pathExists(resourcePath))
    ? await fs.readFile(resourcePath, 'utf8')
    : '# Urchin\n';
  const next = replaceManagedSection(
    existing,
    '## Promoted Sync Signals',
    promotable
      .map((event) => eventLine(config, event, deriveProjectLabel(event, linker)))
      .join('\n'),
    RESOURCE_SECTION_START,
    RESOURCE_SECTION_END,
  );

  await writeFileAtomic(resourcePath, next);
  return { paths: [resourcePath], promotableCount: promotable.length };
}

async function writeDecisionPromotion(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<{ decisionCount: number; paths: string[] }> {
  const decisions = events
    .filter(isDecisionEvent)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
  if (decisions.length === 0) {
    return { decisionCount: 0, paths: [] };
  }

  const decisionPath = path.join(config.vaultRoot, '30-resources', 'decisions.md');
  const existing = (await fs.pathExists(decisionPath))
    ? await fs.readFile(decisionPath, 'utf8')
    : '# Decisions\n';
  const next = replaceManagedSection(
    existing,
    '## Urchin Decisions',
    [
      '- These entries are only promoted from events explicitly tagged as decisions.',
      ...decisions.map((event) => eventLine(config, event, deriveProjectLabel(event, linker))),
    ].join('\n'),
    DECISION_SECTION_START,
    DECISION_SECTION_END,
  );

  await writeFileAtomic(decisionPath, next);
  return { decisionCount: decisions.length, paths: [decisionPath] };
}

export async function promoteEvents(config: UrchinConfig, linker: Linker, events: UrchinEvent[]): Promise<PromotionResult> {
  const [projectResult, resourceResult, decisionResult] = await Promise.all([
    writeProjectPromotions(config, linker, events),
    writeResourcePromotion(config, linker, events),
    writeDecisionPromotion(config, linker, events),
  ]);

  const promotedPaths = [...projectResult.paths, ...resourceResult.paths, ...decisionResult.paths];

  return {
    promotedCount: promotedPaths.length,
    promotedPaths,
    summary: {
      decisions: decisionResult.decisionCount,
      projectEvents: projectResult.projectEventCount,
      projectNotes: projectResult.paths.length,
      resourceNotes: resourceResult.paths.length,
    },
    ...(promotedPaths.length === 0 ? { whyNot: 'no project-tagged or decision events met promotion rules' } : {}),
  };
}
