import * as fs from 'fs-extra';
import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

export class ClaudeCollector implements Collector {
  name: 'claude' = 'claude';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const historyFile = this.config.claudeHistoryFile;
    if (!(await fs.pathExists(historyFile))) return [];

    const rawData = await fs.readFile(historyFile, 'utf-8');
    const lines = rawData.split('\n').filter(l => l.trim().length > 0);

    let events: UrchinEvent[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const timestamp = new Date(entry.timestamp);
        if (since && timestamp < since) continue;

        events.push({
          id: entry.sessionId + '-' + entry.timestamp,
          kind: 'conversation',
          source: 'claude',
          timestamp: timestamp.toISOString(),
          summary: sanitize(entry.display ?? '', 140).split('\n')[0] ?? 'Claude event',
          content: entry.display,
          tags: ['claude', 'session'],
          metadata: { sessionId: entry.sessionId, project: entry.project },
          provenance: {
            adapter: 'claude-history-jsonl',
            location: historyFile,
            scope: 'local',
            sessionId: entry.sessionId,
          },
        });
      } catch (err) {
        console.error(`Error parsing Claude line:`, err);
      }
    }

    return events;
  }
}
