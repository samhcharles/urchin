import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, UrchinEvent } from '../types';

export class GeminiCollector implements Collector {
  name: 'gemini' = 'gemini';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.geminiTmpRoot))) return [];

    const chatFiles = await glob('**/chats/*.json', {
      cwd: this.config.geminiTmpRoot,
      absolute: true,
      ignore: ['**/node_modules/**'],
    });

    let events: UrchinEvent[] = [];

    for (const filePath of chatFiles) {
      try {
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
                id: msg.id ?? `${data.sessionId ?? 'gemini'}-${msg.timestamp}`,
                kind: 'conversation',
                source: 'gemini',
                timestamp: msg.timestamp,
                summary: sanitize(content ?? '', 140).split('\n')[0] ?? 'Gemini event',
                content: content,
                tags: ['gemini', 'session'],
                metadata: { sessionId: data.sessionId },
                provenance: {
                  adapter: 'gemini-chat-json',
                  location: filePath,
                  scope: 'local',
                  sessionId: data.sessionId,
                },
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error parsing Gemini chat file ${filePath}:`, err);
      }
    }

    return events;
  }
}
