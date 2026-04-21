import * as fs from 'fs-extra';
import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

export class OpenClawCollector implements Collector {
  name: 'openclaw' = 'openclaw';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const logFile = this.config.openclawCommandsLog;
    if (!(await fs.pathExists(logFile))) return [];

    const rawData = await fs.readFile(logFile, 'utf-8');
    const lines = rawData.split('\n').filter(l => l.trim().length > 0);

    let events: UrchinEvent[] = [];

    for (const line of lines) {
      try {
        const match = line.match(/^\[(.*?)] user: (.*)$/);
        if (match && match[1] && match[2]) {
          const timestamp = new Date(match[1]);
          if (since && timestamp < since) continue;

          events.push({
            id: 'openclaw-' + match[1],
            kind: 'conversation',
            source: 'openclaw',
            timestamp: timestamp.toISOString(),
            summary: sanitize(match[2], 140).split('\n')[0] ?? 'OpenClaw event',
            content: match[2],
            tags: ['openclaw', 'command'],
            metadata: {},
            provenance: {
              adapter: 'openclaw-commands-log',
              location: logFile,
              scope: 'local',
            },
          });
        }
      } catch (err) {
        // Skip malformed
      }
    }

    return events;
  }
}
