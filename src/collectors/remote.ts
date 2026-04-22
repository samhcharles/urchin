import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { UrchinEvent, Collector } from '../types';

function toMetadata(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value ? { ...(value as Record<string, unknown>) } : {};
}

export class RemoteCollector implements Collector {
  name: 'remote' = 'remote';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.remoteMirrorRoot))) {
      return [];
    }

    const mirrorRootReal = await fs.realpath(this.config.remoteMirrorRoot);
    const files = await glob('**/events.jsonl', {
      cwd: this.config.remoteMirrorRoot,
      absolute: true,
    });

    const events: UrchinEvent[] = [];

    for (const filePath of files) {
      const realFilePath = await fs.realpath(filePath).catch(() => filePath);
      const relative = path.relative(mirrorRootReal, realFilePath);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        continue;
      }

      const mirrorName = path.basename(path.dirname(realFilePath));
      const raw = await fs.readFile(realFilePath, 'utf8');
      for (const line of raw.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line) as UrchinEvent;
          if (!entry.id || !entry.timestamp || !entry.source || !entry.provenance) {
            continue;
          }

          const timestamp = new Date(entry.timestamp);
          if (since && timestamp < since) {
            continue;
          }

          events.push({
            ...entry,
            metadata: {
              ...toMetadata(entry.metadata),
              remoteMirrorName: mirrorName,
              remoteMirrorPath: realFilePath,
            },
          });
        } catch {
          // Skip malformed mirrored events.
        }
      }
    }

    return events;
  }
}
