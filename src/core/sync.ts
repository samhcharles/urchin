import { Linker } from '../synthesis/linker';
import { Collector, UrchinEvent } from '../types';
import { UrchinConfig } from './config';
import { dedupeEvents } from './dedupe';
import { sanitize } from './redaction';
import { loadState, saveState } from './state';
import { writeArchive, writeArchiveIndex } from '../obsidian/writer';

export interface SyncCollectorFailure {
  collector: string;
  error: unknown;
}

export interface SyncResult {
  eventCount: number;
  failedCollectors: SyncCollectorFailure[];
  lastCheckpoint: string;
  sinceDate: string;
  writtenPaths: string[];
}

export interface RunSyncOptions {
  collectors: Collector[];
  linker: Linker;
  now?: () => Date;
}

function defaultSince(syncStartedAt: Date): Date {
  return new Date(syncStartedAt.getTime() - 24 * 60 * 60 * 1000);
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function runSync(config: UrchinConfig, options: RunSyncOptions): Promise<SyncResult> {
  const syncStartedAt = options.now?.() ?? new Date();
  const syncStartedAtIso = syncStartedAt.toISOString();
  const state = await loadState(config.statePath);
  const sinceDate = state.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt)
    : defaultSince(syncStartedAt);

  let allEvents: UrchinEvent[] = [];
  const failedCollectors: SyncCollectorFailure[] = [];
  const sources = { ...(state.sources ?? {}) };

  for (const collector of options.collectors) {
    try {
      const events = await collector.collect(sinceDate);
      allEvents.push(...events);
      sources[collector.name] = {
        ...sources[collector.name],
        eventCount: events.length,
        lastError: undefined,
        lastRunAt: syncStartedAtIso,
        lastSuccessAt: syncStartedAtIso,
      };
    } catch (error) {
      failedCollectors.push({ collector: collector.name, error });
      sources[collector.name] = {
        ...sources[collector.name],
        eventCount: 0,
        lastError: formatError(error),
        lastRunAt: syncStartedAtIso,
      };
    }
  }

  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const uniqueEvents = dedupeEvents(allEvents);
  const sanitizedEvents = uniqueEvents.map((event) => ({
    ...event,
    summary: sanitize(event.summary, 240),
    content: sanitize(event.content, event.kind === 'agent' ? 8000 : 1500),
  }));

  const writtenPaths =
    sanitizedEvents.length > 0
      ? await writeArchive(config, options.linker, sanitizedEvents)
      : [];

  await writeArchiveIndex(config);

  await saveState(config.statePath, {
    ...state,
    lastSyncStartedAt: syncStartedAtIso,
    ...(failedCollectors.length === 0 ? { lastSuccessfulSyncAt: syncStartedAtIso } : {}),
    sources,
  });

  return {
    eventCount: sanitizedEvents.length,
    failedCollectors,
    lastCheckpoint: syncStartedAtIso,
    sinceDate: sinceDate.toISOString(),
    writtenPaths,
  };
}
