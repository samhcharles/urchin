import * as fs from 'fs-extra';

import { writeJsonAtomic } from './io';
import { EventSource } from '../types';

export interface SourceSyncState {
  collectedCount?: number;
  eventCount?: number;
  lastError?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
}

export interface UrchinState {
  lastPromotionNotReason?: string;
  lastSyncCollectedCount?: number;
  lastSyncDedupedCount?: number;
  lastSyncPromotedCount?: number;
  lastSuccessfulSyncAt?: string;
  lastSyncStartedAt?: string;
  lastSyncWrittenCount?: number;
  sources?: Partial<Record<EventSource, SourceSyncState>>;
}

export async function loadState(statePath: string): Promise<UrchinState> {
  if (!(await fs.pathExists(statePath))) {
    return {};
  }

  try {
    return await fs.readJson(statePath);
  } catch {
    return {};
  }
}

export async function saveState(statePath: string, state: UrchinState): Promise<void> {
  await writeJsonAtomic(statePath, state);
}
