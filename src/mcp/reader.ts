import * as fs from 'fs-extra';
import { EventIdentity, EventKind, EventSource, UrchinEvent } from '../types';

export interface CachedEvent {
  id: string;
  timestamp: string;
  source: EventSource;
  kind: EventKind;
  sessionId?: string;
  summary: string;
  content: string;
  identity?: EventIdentity;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ReadOptions {
  since?: Date;
  session?: string;
  source?: EventSource;
  limit?: number;
}

export async function readCachedEvents(cachePath: string, opts: ReadOptions = {}): Promise<CachedEvent[]> {
  if (!(await fs.pathExists(cachePath))) return [];

  const raw = await fs.readFile(cachePath, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  const events: CachedEvent[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as UrchinEvent;
      if (!e.id || !e.timestamp || !e.source) continue;
      if (opts.since && new Date(e.timestamp) < opts.since) continue;
      if (opts.source && e.source !== opts.source) continue;
      const sessionId =
        typeof e.provenance?.sessionId === 'string' && e.provenance.sessionId.trim()
          ? e.provenance.sessionId
          : typeof e.metadata?.sessionId === 'string' && e.metadata.sessionId.trim()
            ? e.metadata.sessionId
            : undefined;
      if (opts.session && sessionId !== opts.session) continue;
      events.push({
        id: e.id,
        timestamp: e.timestamp,
        source: e.source,
        kind: e.kind,
        ...(sessionId ? { sessionId } : {}),
        summary: e.summary,
        content: e.content,
        ...(e.identity ? { identity: e.identity } : {}),
        tags: e.tags ?? [],
        metadata: e.metadata ?? {},
      });
    } catch {
      // skip malformed lines
    }
  }

  // newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (opts.limit !== undefined && opts.limit > 0) {
    return events.slice(0, opts.limit);
  }

  return events;
}
