import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

interface ProjectTranscriptResult {
  events: UrchinEvent[];
  sessionIds: Set<string>;
}

const LOW_SIGNAL_PATTERNS = [
  /^\/(?:clear|compact|resume|rate-limit-options)\b/i,
  /^<command-name>/i,
  /^\[Pasted text #\d+/,
  /^This session is being continued from a previous conversation/i,
  /^\d{12,}$/,
];

function summary(text: string): string {
  return sanitize(text, 140).split('\n')[0] ?? 'Claude event';
}

function extractTranscriptText(entry: any): string {
  const message = entry?.message;
  if (!message) {
    return '';
  }

  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  const parts: string[] = [];

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    if (item.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }

  return parts.join('\n\n');
}

function isLowSignal(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export class ClaudeCollector implements Collector {
  name: 'claude' = 'claude';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const { events: transcriptEvents, sessionIds } = await this.collectProjectTranscripts(since);
    const historyEvents = await this.collectHistory(since, sessionIds);
    return [...historyEvents, ...transcriptEvents];
  }

  private async collectHistory(since: Date | undefined, transcriptSessionIds: Set<string>): Promise<UrchinEvent[]> {
    const historyFile = this.config.claudeHistoryFile;
    if (!(await fs.pathExists(historyFile))) {
      return [];
    }

    const rawData = await fs.readFile(historyFile, 'utf-8');
    const lines = rawData.split('\n').filter((line) => line.trim().length > 0);

    const events: UrchinEvent[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp);
        if (since && timestamp < since) {
          continue;
        }

        if (transcriptSessionIds.has(entry.sessionId)) {
          continue;
        }

        if (typeof entry.display !== 'string' || isLowSignal(entry.display)) {
          continue;
        }

        events.push({
          id: `${entry.sessionId}-${entry.timestamp}`,
          kind: 'conversation',
          source: 'claude',
          timestamp: timestamp.toISOString(),
          summary: summary(entry.display),
          content: entry.display,
          tags: ['claude', 'history'],
          metadata: { project: entry.project, source: 'history' },
          provenance: {
            adapter: 'claude-history-jsonl',
            location: historyFile,
            scope: 'local',
            sessionId: entry.sessionId,
          },
        });
      } catch (error) {
        console.error('Error parsing Claude history line:', error);
      }
    }

    return events;
  }

  private async collectProjectTranscripts(since?: Date): Promise<ProjectTranscriptResult> {
    const claudeRoot = path.dirname(this.config.claudeHistoryFile);
    const projectRoot = path.join(claudeRoot, 'projects');
    if (!(await fs.pathExists(projectRoot))) {
      return { events: [], sessionIds: new Set<string>() };
    }

    const files = await glob('**/*.jsonl', {
      cwd: projectRoot,
      absolute: true,
      ignore: ['**/subagents/*.jsonl'],
    });

    const events: UrchinEvent[] = [];
    const sessionIds = new Set<string>();

    for (const filePath of files) {
      const rawData = await fs.readFile(filePath, 'utf8');
      for (const line of rawData.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const timestamp = new Date(entry.timestamp);
          if (since && timestamp < since) {
            continue;
          }

          if (entry.isMeta || entry.type === 'attachment' || entry.type === 'system') {
            continue;
          }

          const content = extractTranscriptText(entry);
          if (isLowSignal(content)) {
            continue;
          }

          if (typeof entry.sessionId === 'string') {
            sessionIds.add(entry.sessionId);
          }

          events.push({
            id: entry.uuid ?? `${entry.sessionId ?? path.basename(filePath)}-${entry.timestamp}`,
            kind: 'conversation',
            source: 'claude',
            timestamp: timestamp.toISOString(),
            summary: summary(content),
            content,
            tags: ['claude', 'project-transcript'],
            metadata: {
              cwd: entry.cwd,
              project: entry.project,
              role: entry.message?.role ?? entry.type,
              source: 'projects',
            },
            provenance: {
              adapter: 'claude-project-jsonl',
              location: filePath,
              scope: 'local',
              sessionId: entry.sessionId,
            },
          });
        } catch {
          // Skip malformed transcript lines.
        }
      }
    }

    return { events, sessionIds };
  }
}
