import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { Collector, UrchinEvent } from '../types';

export class ClaudeCollector implements Collector {
  name: 'claude' = 'claude';

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const historyFile = path.join(os.homedir(), '.claude/history.jsonl');
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
          source: 'claude',
          timestamp: timestamp.toISOString(),
          content: entry.display,
          metadata: { sessionId: entry.sessionId, project: entry.project }
        });
      } catch (err) {
        console.error(`Error parsing Claude line:`, err);
      }
    }

    return events;
  }
}
