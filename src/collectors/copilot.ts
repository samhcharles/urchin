import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

function summarize(text: string): string {
  const trimmed = sanitize(text, 140);
  return trimmed.split('\n')[0] ?? trimmed;
}

export class CopilotCollector implements Collector {
  name: 'copilot' = 'copilot';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.copilotSessionRoot))) {
      return [];
    }

    const eventFiles = await glob('*/events.jsonl', {
      cwd: this.config.copilotSessionRoot,
      absolute: true,
    });

    const events: UrchinEvent[] = [];

    for (const eventFile of eventFiles) {
      const raw = await fs.readFile(eventFile, 'utf8');
      for (const line of raw.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const timestamp = new Date(entry.timestamp);
          if (since && timestamp < since) {
            continue;
          }

          const type = entry.type;
          const data = entry.data ?? {};
          const content = typeof data.content === 'string' ? data.content : '';
          if (type !== 'user.message' && type !== 'assistant.message') {
            continue;
          }
          if (!content.trim()) {
            continue;
          }

          events.push({
            id: entry.id ?? `${path.basename(path.dirname(eventFile))}-${entry.timestamp}`,
            kind: 'conversation',
            source: 'copilot',
            timestamp: timestamp.toISOString(),
            summary: summarize(content),
            content,
            tags: ['copilot', 'session'],
            metadata: {
              interactionId: data.interactionId,
              role: type === 'user.message' ? 'user' : 'assistant',
            },
            provenance: {
              adapter: 'copilot-session-state',
              location: eventFile,
              scope: 'local',
              sessionId: path.basename(path.dirname(eventFile)),
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
