import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, EventKind, UrchinEvent } from '../types';

interface VSCodeQueueEntry {
  content?: unknown;
  filePath?: unknown;
  id?: unknown;
  kind?: unknown;
  role?: unknown;
  selection?: unknown;
  sessionId?: unknown;
  summary?: unknown;
  timestamp?: unknown;
  title?: unknown;
  workspacePath?: unknown;
}

function toKind(value: unknown): EventKind {
  if (value === 'agent') {
    return 'agent';
  }

  return 'conversation';
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function summarize(entry: VSCodeQueueEntry, content: string): string {
  const explicit = toString(entry.summary);
  if (explicit) {
    return sanitize(explicit, 140);
  }

  const title = toString(entry.title);
  const role = toString(entry.role);
  if (title && role) {
    return sanitize(`VS Code ${role} — ${title}`, 140);
  }

  if (title) {
    return sanitize(`VS Code — ${title}`, 140);
  }

  if (role) {
    return sanitize(`VS Code ${role}`, 140);
  }

  return sanitize(content, 140).split('\n')[0] ?? 'VS Code event';
}

function repoFromWorkspace(workspacePath: string | undefined): string | undefined {
  if (!workspacePath) {
    return undefined;
  }

  const base = path.basename(workspacePath);
  return base && base !== '.' && base !== path.sep ? sanitize(base, 120) : undefined;
}

export class VSCodeCollector implements Collector {
  name: 'vscode' = 'vscode';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.vscodeEventsPath))) {
      return [];
    }

    const raw = await fs.readFile(this.config.vscodeEventsPath, 'utf8');
    const events: UrchinEvent[] = [];

    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line) as VSCodeQueueEntry;
        const timestamp = new Date(toString(entry.timestamp) ?? Date.now());
        if (since && timestamp < since) {
          continue;
        }

        const content = toString(entry.content);
        const workspacePath = toString(entry.workspacePath);
        const sessionId = toString(entry.sessionId);
        if (!content || !workspacePath || !sessionId) {
          continue;
        }

        const filePath = toString(entry.filePath);
        const selection = toString(entry.selection);
        const title = toString(entry.title);
        const role = toString(entry.role);
        const repo = repoFromWorkspace(workspacePath);

        events.push({
          id: toString(entry.id) ?? `vscode-${sessionId}-${timestamp.toISOString()}`,
          kind: toKind(entry.kind),
          source: 'vscode',
          timestamp: timestamp.toISOString(),
          summary: summarize(entry, content),
          content,
          tags: ['editor', 'vscode', ...(role ? [role] : [])],
          metadata: {
            editor: 'vscode',
            ...(filePath ? { filePath } : {}),
            ...(role ? { role } : {}),
            ...(selection ? { selection } : {}),
            ...(title ? { title } : {}),
            workspacePath,
          },
          provenance: {
            adapter: 'vscode-bridge-jsonl',
            location: this.config.vscodeEventsPath,
            scope: 'local',
            ...(repo ? { repo } : {}),
            sessionId,
          },
        });
      } catch {
        // Skip malformed queue entries.
      }
    }

    return events;
  }
}
