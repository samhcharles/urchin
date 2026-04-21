import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { Collector, UrchinEvent } from '../types';

export class OpenClawCollector implements Collector {
  name: 'openclaw' = 'openclaw';

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const logFile = path.join(os.homedir(), '.openclaw/logs/commands.log');
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
            source: 'openclaw',
            timestamp: timestamp.toISOString(),
            content: match[2]
          });
        }
      } catch (err) {
        // Skip malformed
      }
    }

    return events;
  }
}
