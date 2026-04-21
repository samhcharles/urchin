import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, EventKind, EventSource, UrchinEvent } from '../types';

function toSource(value: unknown): EventSource {
  const normalized = typeof value === 'string' ? value : 'manual';
  const knownSources: EventSource[] = ['agent', 'browser', 'claude', 'copilot', 'gemini', 'git', 'manual', 'openclaw', 'shell', 'vscode'];
  return knownSources.includes(normalized as EventSource) ? (normalized as EventSource) : 'manual';
}

function toKind(value: unknown): EventKind {
  const normalized = typeof value === 'string' ? value : 'capture';
  const knownKinds: EventKind[] = ['activity', 'agent', 'capture', 'code', 'conversation', 'ops'];
  return knownKinds.includes(normalized as EventKind) ? (normalized as EventKind) : 'capture';
}

export class IntakeCollector implements Collector {
  name: 'browser' = 'browser';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.intakeRoot))) {
      return [];
    }

    const intakeRootReal = await fs.realpath(this.config.intakeRoot);
    const files = await glob('**/*.jsonl', {
      cwd: this.config.intakeRoot,
      absolute: true,
    });

    const events: UrchinEvent[] = [];

    for (const filePath of files) {
      const realFilePath = await fs.realpath(filePath).catch(() => filePath);
      const relative = path.relative(intakeRootReal, realFilePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        continue;
      }

      const raw = await fs.readFile(realFilePath, 'utf8');
      for (const line of raw.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const timestamp = new Date(entry.timestamp ?? Date.now());
          if (since && timestamp < since) {
            continue;
          }

          const content = typeof entry.content === 'string' ? entry.content : '';
          if (!content.trim()) {
            continue;
          }

          const source = toSource(entry.source);
          events.push({
            id: entry.id ?? `${path.basename(filePath)}-${timestamp.toISOString()}`,
            kind: toKind(entry.kind),
            source,
            timestamp: timestamp.toISOString(),
            summary: sanitize(typeof entry.summary === 'string' ? entry.summary : content, 140),
            content,
            tags: Array.isArray(entry.tags) ? entry.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
            metadata: typeof entry.metadata === 'object' && entry.metadata ? entry.metadata : {},
            provenance: {
              adapter: 'append-only-intake',
              location: realFilePath,
              scope: entry.scope === 'network' ? 'network' : 'local',
              sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : undefined,
            },
          });
        } catch {
          // Skip malformed lines.
        }
      }
    }

    return events;
  }
}
