import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';

import { UrchinEvent, EventIdentity, EventVisibility } from '../types';
import { UrchinConfig } from './config';

function sanitizeIdentifier(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'unknown';
}

function envIdentifier(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? sanitizeIdentifier(value) : undefined;
}

function workspacePathFromEvent(event: UrchinEvent): string | undefined {
  const workspacePath = event.metadata.workspacePath;
  return typeof workspacePath === 'string' && workspacePath.trim() ? workspacePath.trim() : undefined;
}

function basenameId(input: string): string | undefined {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '');
  const base = path.posix.basename(normalized);
  return base && base !== '.' && base !== '/' ? sanitizeIdentifier(base) : undefined;
}

function resolveVisibility(): EventVisibility {
  const configured = process.env.URCHIN_DEFAULT_VISIBILITY?.trim();
  if (configured === 'team' || configured === 'public') {
    return configured;
  }
  return 'private';
}

function resolveIdentity(event: UrchinEvent): EventIdentity {
  const username = sanitizeIdentifier(os.userInfo().username);
  const workspacePath = workspacePathFromEvent(event);
  const repoId = event.provenance.repo ? sanitizeIdentifier(event.provenance.repo) : undefined;
  const workspaceId = workspacePath ? basenameId(workspacePath) ?? repoId : repoId;
  const projectId = repoId ?? workspaceId;

  return {
    accountId: envIdentifier('URCHIN_ACCOUNT_ID') ?? username,
    actorId: envIdentifier('URCHIN_ACTOR_ID') ?? username,
    deviceId: envIdentifier('URCHIN_DEVICE_ID') ?? sanitizeIdentifier(os.hostname()),
    ...(projectId ? { projectId } : {}),
    visibility: resolveVisibility(),
    ...(workspaceId ? { workspaceId } : {}),
  };
}

export function toCanonicalEvent(event: UrchinEvent): UrchinEvent {
  return {
    ...event,
    identity: {
      ...resolveIdentity(event),
      ...(event.identity ?? {}),
    },
  };
}

export async function appendEventJournal(config: UrchinConfig, events: UrchinEvent[]): Promise<void> {
  await fs.ensureDir(path.dirname(config.eventJournalPath));
  const newLines = events.map((event) => JSON.stringify(event)).join('\n') + '\n';
  await fs.appendFile(config.eventJournalPath, newLines, 'utf8');
}
