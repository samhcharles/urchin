import { createHash } from 'node:crypto';

import { UrchinEvent } from '../types';

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function minuteBucket(timestamp: string): string {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  return date.toISOString();
}

function fingerprint(event: UrchinEvent): string {
  return createHash('sha256')
    .update([
      event.source,
      event.kind,
      minuteBucket(event.timestamp),
      normalize(event.summary),
      normalize(event.content).slice(0, 500),
    ].join('|'))
    .digest('hex');
}

export function dedupeEvents(events: UrchinEvent[]): UrchinEvent[] {
  const seen = new Set<string>();
  const deduped: UrchinEvent[] = [];

  for (const event of events) {
    const key = fingerprint(event);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(event);
  }

  return deduped;
}
