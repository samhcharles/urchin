import * as fs from 'fs-extra';

import { writeJsonAtomic } from './io';

export interface UrchinState {
  lastSuccessfulSyncAt?: string;
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
