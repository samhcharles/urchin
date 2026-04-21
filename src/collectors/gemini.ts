import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { Collector, UrchinEvent } from '../types';

export class GeminiCollector implements Collector {
  name: 'gemini' = 'gemini';

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const chatDir = path.join(os.homedir(), '.gemini/tmp/samhc/chats');
    if (!(await fs.pathExists(chatDir))) return [];

    const files = await fs.readdir(chatDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let events: UrchinEvent[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(chatDir, file);
        const stats = await fs.stat(filePath);
        if (since && stats.mtime < since) continue;

        const data = await fs.readJson(filePath);
        if (data.messages && Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            if (msg.type === 'user') {
              const content = Array.isArray(msg.content) 
                ? msg.content.map((c: any) => c.text).join('\n')
                : msg.content;
              
              events.push({
                id: msg.id,
                source: 'gemini',
                timestamp: msg.timestamp,
                content: content,
                metadata: { sessionId: data.sessionId }
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error parsing Gemini chat file ${file}:`, err);
      }
    }

    return events;
  }
}
