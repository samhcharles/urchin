import * as fs from 'fs-extra';
import * as path from 'node:path';
import { Linker } from '../synthesis/linker';
import { Collector, UrchinEvent } from '../types';
import { UrchinConfig } from './config';
import { dedupeEvents } from './dedupe';
import { sanitize } from './redaction';
import { loadState, saveState } from './state';
import { promoteEvents } from '../obsidian/promote';
import { writeArchive, writeArchiveIndex } from '../obsidian/writer';

export interface SyncCollectorFailure {
  collector: string;
  error: unknown;
}

export interface SyncSourceBreakdown {
  collectedCount: number;
  error?: string;
  source: Collector['name'];
}

export interface SyncResult {
  collectedCount: number;
  dedupedCount: number;
  eventCount: number;
  failedCollectors: SyncCollectorFailure[];
  lastCheckpoint: string;
  promotedCount: number;
  promotedPaths: string[];
  promotionNotReason?: string;
  promotionSummary: {
    decisions: number;
    projectEvents: number;
    projectNotes: number;
    resourceNotes: number;
  };
  sinceDate: string;
  sourceBreakdown: SyncSourceBreakdown[];
  writtenCount: number;
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

const CACHE_MAX_DAYS = 30;

async function appendEventCache(config: UrchinConfig, events: UrchinEvent[]): Promise<void> {
  await fs.ensureDir(path.dirname(config.eventCachePath));
  const newLines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(config.eventCachePath, newLines, 'utf8');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_MAX_DAYS);
  const raw = await fs.readFile(config.eventCachePath, 'utf8');
  const kept = raw
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      try {
        const e = JSON.parse(line) as { timestamp?: string };
        return typeof e.timestamp === 'string' && new Date(e.timestamp) >= cutoff;
      } catch {
        return false;
      }
    })
    .join('\n') + '\n';
  await fs.writeFile(config.eventCachePath, kept, 'utf8');
}

export async function runSync(config: UrchinConfig, options: RunSyncOptions): Promise<SyncResult> {
  const syncStartedAt = options.now?.() ?? new Date();
  const syncStartedAtIso = syncStartedAt.toISOString();
  const state = await loadState(config.statePath);
  // Global fallback: used only to populate sinceDate in the result. Per-source checkpoints
  // take precedence so that new sources can backfill historical data without being blocked
  // by a global checkpoint that predates their first appearance.
  const globalSince = state.lastSuccessfulSyncAt
    ? new Date(state.lastSuccessfulSyncAt)
    : defaultSince(syncStartedAt);

  let allEvents: UrchinEvent[] = [];
  const failedCollectors: SyncCollectorFailure[] = [];
  const sources = { ...(state.sources ?? {}) };
  const sourceBreakdown: SyncSourceBreakdown[] = [];

  for (const collector of options.collectors) {
    // Use per-source checkpoint so new sources can backfill and existing sources
    // don't lose events after a partial-failure that advanced the global checkpoint.
    const sourceState = state.sources?.[collector.name];
    const sinceDate = sourceState?.lastSuccessAt
      ? new Date(sourceState.lastSuccessAt)
      : undefined;
    try {
      const events = await collector.collect(sinceDate);
      allEvents.push(...events);
      sourceBreakdown.push({
        collectedCount: events.length,
        source: collector.name,
      });
      sources[collector.name] = {
        ...sources[collector.name],
        collectedCount: events.length,
        eventCount: events.length,
        lastError: undefined,
        lastRunAt: syncStartedAtIso,
        lastSuccessAt: syncStartedAtIso,
      };
    } catch (error) {
      failedCollectors.push({ collector: collector.name, error });
      sourceBreakdown.push({
        collectedCount: 0,
        error: formatError(error),
        source: collector.name,
      });
      sources[collector.name] = {
        ...sources[collector.name],
        collectedCount: 0,
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
  const collectedCount = allEvents.length;
  const dedupedCount = uniqueEvents.length;
  const writtenCount = sanitizedEvents.length;

  const writtenPaths =
    sanitizedEvents.length > 0
      ? await writeArchive(config, options.linker, sanitizedEvents)
      : [];
  const promotionResult =
    sanitizedEvents.length > 0
      ? await promoteEvents(config, options.linker, sanitizedEvents)
      : {
          promotedCount: 0,
          promotedPaths: [],
          promotionSummary: undefined,
          summary: {
            decisions: 0,
            projectEvents: 0,
            projectNotes: 0,
            resourceNotes: 0,
          },
          whyNot: 'no events written',
        };

  await writeArchiveIndex(config);
  if (sanitizedEvents.length > 0) {
    await appendEventCache(config, sanitizedEvents);
  }

  await saveState(config.statePath, {
    ...state,
    lastPromotionNotReason: promotionResult.whyNot,
    lastSyncCollectedCount: collectedCount,
    lastSyncDedupedCount: dedupedCount,
    lastSyncPromotedCount: promotionResult.promotedCount,
    lastSyncStartedAt: syncStartedAtIso,
    lastSyncWrittenCount: writtenCount,
    ...(failedCollectors.length === 0 ? { lastSuccessfulSyncAt: syncStartedAtIso } : {}),
    sources,
  });

  return {
    collectedCount,
    dedupedCount,
    eventCount: sanitizedEvents.length,
    failedCollectors,
    lastCheckpoint: syncStartedAtIso,
    promotedCount: promotionResult.promotedCount,
    promotedPaths: promotionResult.promotedPaths,
    promotionNotReason: promotionResult.whyNot,
    promotionSummary: promotionResult.summary,
    sinceDate: globalSince.toISOString(),
    sourceBreakdown,
    writtenCount,
    writtenPaths,
  };
}
