import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinEvent } from '../types';
import { UrchinConfig } from './config';
import { NodeIdentityProfile, toEventIdentity } from './identity';

export function toCanonicalEvent(event: UrchinEvent, nodeIdentity: NodeIdentityProfile): UrchinEvent {
  return {
    ...event,
    identity: toEventIdentity(event, nodeIdentity),
  };
}

export async function appendEventJournal(config: UrchinConfig, events: UrchinEvent[]): Promise<void> {
  await fs.ensureDir(path.dirname(config.eventJournalPath));
  const newLines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  await fs.appendFile(config.eventJournalPath, newLines, 'utf8');
}
