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

export async function runSync(config: UrchinConfig, options: RunSyncOptions): Promise<SyncResult> {
  const syncStartedAt = options.now?.() ?? new Date();
  const state = await loadState(config.statePath);
  const sinceDate = state.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt)
    : defaultSince(syncStartedAt);

  let allEvents: UrchinEvent[] = [];
  const failedCollectors: SyncCollectorFailure[] = [];

  for (const collector of options.collectors) {
    try {
      const events = await collector.collect(sinceDate);
      allEvents.push(...events);
    } catch (error) {
      failedCollectors.push({ collector: collector.name, error });
    }
  }

  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const uniqueEvents = dedupeEvents(allEvents);
  const sanitizedEvents = uniqueEvents.map((event) => ({
    ...event,
    summary: sanitize(event.summary, 240),
    content: sanitize(event.content),
  }));

  const writtenPaths =
    sanitizedEvents.length > 0
      ? await writeArchive(config, options.linker, sanitizedEvents)
      : [];

  await writeArchiveIndex(config);

  if (failedCollectors.length === 0) {
    await saveState(config.statePath, { lastSuccessfulSyncAt: syncStartedAt.toISOString() });
  }

  return {
    eventCount: sanitizedEvents.length,
    failedCollectors,
    lastCheckpoint: syncStartedAt.toISOString(),
    sinceDate: sinceDate.toISOString(),
    writtenPaths,
  };
}
