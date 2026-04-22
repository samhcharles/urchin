import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';

import { EventIdentity, EventVisibility, UrchinEvent } from '../types';
import { UrchinConfig } from './config';
import { writeJsonAtomic } from './io';

export interface NodeIdentityProfile {
  accountId: string;
  actorId: string;
  deviceId: string;
  visibility: EventVisibility;
}

export interface NodeIdentityFieldSources {
  accountId: 'env' | 'file' | 'fallback';
  actorId: 'env' | 'file' | 'fallback';
  deviceId: 'env' | 'file' | 'fallback';
  visibility: 'env' | 'file' | 'fallback';
}

export interface ResolvedNodeIdentity {
  exists: boolean;
  identity: NodeIdentityProfile;
  path: string;
  sources: NodeIdentityFieldSources;
}

interface PersistedNodeIdentityRecord {
  accountId?: string;
  actorId?: string;
  createdAt?: string;
  deviceId?: string;
  updatedAt?: string;
  visibility?: EventVisibility;
}

export function sanitizeIdentifier(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'unknown';
}

function normalizeVisibility(value: string | undefined): EventVisibility | undefined {
  if (value === 'private' || value === 'team' || value === 'public') {
    return value;
  }

  return undefined;
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

function parsePersistedIdentity(raw: unknown): PersistedNodeIdentityRecord {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const record = raw as Record<string, unknown>;
  const accountId = typeof record.accountId === 'string' && record.accountId.trim()
    ? sanitizeIdentifier(record.accountId)
    : undefined;
  const actorId = typeof record.actorId === 'string' && record.actorId.trim()
    ? sanitizeIdentifier(record.actorId)
    : undefined;
  const deviceId = typeof record.deviceId === 'string' && record.deviceId.trim()
    ? sanitizeIdentifier(record.deviceId)
    : undefined;
  const visibility = typeof record.visibility === 'string'
    ? normalizeVisibility(record.visibility)
    : undefined;

  return {
    ...(accountId ? { accountId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(typeof record.createdAt === 'string' ? { createdAt: record.createdAt } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
    ...(visibility ? { visibility } : {}),
  };
}

async function readPersistedIdentity(identityPath: string): Promise<{ exists: boolean; record: PersistedNodeIdentityRecord }> {
  const exists = await fs.pathExists(identityPath);
  if (!exists) {
    return { exists, record: {} };
  }

  const record = await fs.readJson(identityPath).then(parsePersistedIdentity).catch(() => ({}));
  return { exists, record };
}

export async function resolveNodeIdentity(config: Pick<UrchinConfig, 'identityPath'>): Promise<ResolvedNodeIdentity> {
  const persisted = await readPersistedIdentity(config.identityPath);
  const fallbackAccount = sanitizeIdentifier(os.userInfo().username);
  const fallbackActor = fallbackAccount;
  const fallbackDevice = sanitizeIdentifier(os.hostname());
  const fallbackVisibility: EventVisibility = 'private';

  const envAccountId = envIdentifier('URCHIN_ACCOUNT_ID');
  const envActorId = envIdentifier('URCHIN_ACTOR_ID');
  const envDeviceId = envIdentifier('URCHIN_DEVICE_ID');
  const envVisibility = normalizeVisibility(process.env.URCHIN_DEFAULT_VISIBILITY?.trim());

  return {
    exists: persisted.exists,
    identity: {
      accountId: envAccountId ?? persisted.record.accountId ?? fallbackAccount,
      actorId: envActorId ?? persisted.record.actorId ?? fallbackActor,
      deviceId: envDeviceId ?? persisted.record.deviceId ?? fallbackDevice,
      visibility: envVisibility ?? persisted.record.visibility ?? fallbackVisibility,
    },
    path: config.identityPath,
    sources: {
      accountId: envAccountId ? 'env' : persisted.record.accountId ? 'file' : 'fallback',
      actorId: envActorId ? 'env' : persisted.record.actorId ? 'file' : 'fallback',
      deviceId: envDeviceId ? 'env' : persisted.record.deviceId ? 'file' : 'fallback',
      visibility: envVisibility ? 'env' : persisted.record.visibility ? 'file' : 'fallback',
    },
  };
}

export async function ensureNodeIdentity(
  config: Pick<UrchinConfig, 'identityPath'>,
  overrides: Partial<NodeIdentityProfile> = {},
  now: () => Date = () => new Date(),
): Promise<ResolvedNodeIdentity> {
  const persisted = await readPersistedIdentity(config.identityPath);
  const current = await resolveNodeIdentity(config);
  const nextRecord: PersistedNodeIdentityRecord = {
    accountId: overrides.accountId ? sanitizeIdentifier(overrides.accountId) : current.identity.accountId,
    actorId: overrides.actorId ? sanitizeIdentifier(overrides.actorId) : current.identity.actorId,
    createdAt: persisted.record.createdAt ?? now().toISOString(),
    deviceId: overrides.deviceId ? sanitizeIdentifier(overrides.deviceId) : current.identity.deviceId,
    updatedAt: now().toISOString(),
    visibility: overrides.visibility ?? current.identity.visibility,
  };

  await writeJsonAtomic(config.identityPath, nextRecord);
  return resolveNodeIdentity(config);
}

export function toEventIdentity(event: UrchinEvent, nodeIdentity: NodeIdentityProfile): EventIdentity {
  const workspacePath = workspacePathFromEvent(event);
  const repoId = event.provenance.repo ? sanitizeIdentifier(event.provenance.repo) : undefined;
  const workspaceId = workspacePath ? basenameId(workspacePath) ?? repoId : repoId;
  const projectId = repoId ?? workspaceId;

  return {
    ...nodeIdentity,
    ...(projectId ? { projectId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(event.identity ?? {}),
  };
}
