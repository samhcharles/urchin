import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';

import * as fs from 'fs-extra';

import { UrchinConfig } from '../core/config';
import { sanitizeIdentifier } from '../core/identity';
import { writeFileAtomic, writeJsonAtomic } from '../core/io';

const execFileAsync = promisify(execFile);

export interface RemoteMirrorManifest {
  eventCount: number;
  host: string;
  identityFetched: boolean;
  identityMirrorPath: string;
  journalMirrorPath: string;
  journalRemotePath: string;
  mirrorName: string;
  pulledAt: string;
}

export interface RemoteSourceConfig {
  enabled: boolean;
  host: string;
  identityPath?: string;
  journalPath?: string;
  name: string;
}

export interface PullRemoteJournalOptions {
  config: UrchinConfig;
  host: string;
  identityPath?: string;
  journalPath?: string;
  name: string;
  now?: () => Date;
  runCommand?: (file: string, args: string[]) => Promise<{ stderr?: string; stdout: string }>;
  sshPath?: string;
}

export interface PullRemoteJournalResult {
  eventCount: number;
  host: string;
  identityFetched: boolean;
  identityMirrorPath: string;
  journalMirrorPath: string;
  manifestPath: string;
  mirrorName: string;
}

export interface RemotePullFailure {
  error: string;
  host: string;
  name: string;
}

export interface PullConfiguredRemoteJournalsOptions {
  config: UrchinConfig;
  now?: () => Date;
  runCommand?: (file: string, args: string[]) => Promise<{ stderr?: string; stdout: string }>;
  sshPath?: string;
}

export interface PullConfiguredRemoteJournalsResult {
  configuredCount: number;
  configExists: boolean;
  configPath: string;
  failures: RemotePullFailure[];
  pulled: PullRemoteJournalResult[];
}

function quoteRemoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function normalizeRemoteSource(value: unknown): RemoteSourceConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const name = typeof entry.name === 'string' ? sanitizeIdentifier(entry.name) : '';
  const host = typeof entry.host === 'string' ? entry.host.trim() : '';
  if (!name || !host) {
    return null;
  }

  return {
    enabled: entry.enabled === false ? false : true,
    host,
    ...(typeof entry.identityPath === 'string' && entry.identityPath.trim() ? { identityPath: entry.identityPath.trim() } : {}),
    ...(typeof entry.journalPath === 'string' && entry.journalPath.trim() ? { journalPath: entry.journalPath.trim() } : {}),
    name,
  };
}

export async function loadRemoteSources(config: Pick<UrchinConfig, 'remoteSourcesPath'>): Promise<{
  configExists: boolean;
  configPath: string;
  remotes: RemoteSourceConfig[];
}> {
  const configExists = await fs.pathExists(config.remoteSourcesPath);
  if (!configExists) {
    return {
      configExists,
      configPath: config.remoteSourcesPath,
      remotes: [],
    };
  }

  const raw = await fs.readJson(config.remoteSourcesPath);
  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { remotes?: unknown[] }).remotes)
      ? (raw as { remotes: unknown[] }).remotes
      : null;

  if (!entries) {
    throw new Error(`Remote sources config ${config.remoteSourcesPath} must be an array or an object with remotes[].`);
  }

  return {
    configExists,
    configPath: config.remoteSourcesPath,
    remotes: entries
      .map((entry, index) => {
        const normalized = normalizeRemoteSource(entry);
        if (!normalized) {
          throw new Error(`Remote source entry ${index} in ${config.remoteSourcesPath} must include name and host.`);
        }

        return normalized;
      })
      .filter((entry) => entry.enabled),
  };
}

async function runRemoteCommand(
  host: string,
  command: string,
  runCommand: PullRemoteJournalOptions['runCommand'],
  sshPath: string,
): Promise<{ stderr?: string; stdout: string }> {
  if (runCommand) {
    return runCommand(sshPath, [host, command]);
  }

  return execFileAsync(sshPath, [host, command]);
}

export async function pullRemoteJournal(options: PullRemoteJournalOptions): Promise<PullRemoteJournalResult> {
  const mirrorName = sanitizeIdentifier(options.name);
  const mirrorRoot = path.join(options.config.remoteMirrorRoot, mirrorName);
  const journalMirrorPath = path.join(mirrorRoot, 'events.jsonl');
  const identityMirrorPath = path.join(mirrorRoot, 'identity.json');
  const manifestPath = path.join(mirrorRoot, 'manifest.json');
  const journalRemotePath = options.journalPath ?? '~/.local/share/urchin/journal/events.jsonl';
  const remoteIdentityPath = options.identityPath ?? '~/.config/urchin/identity.json';
  const sshPath = options.sshPath ?? 'ssh';

  await fs.ensureDir(mirrorRoot);

  const journal = await runRemoteCommand(
    options.host,
    `cat ${quoteRemoteShellArg(journalRemotePath)}`,
    options.runCommand,
    sshPath,
  );
  await writeFileAtomic(journalMirrorPath, journal.stdout);

  let identityFetched = false;
  try {
    const identity = await runRemoteCommand(
      options.host,
      `cat ${quoteRemoteShellArg(remoteIdentityPath)}`,
      options.runCommand,
      sshPath,
    );
    if (identity.stdout.trim()) {
      await writeFileAtomic(identityMirrorPath, identity.stdout);
      identityFetched = true;
    }
  } catch {
    // Identity is optional for the bridge. Missing remote identity should not block mirror pulls.
  }

  const eventCount = journal.stdout.split('\n').filter((line) => line.trim()).length;
  const manifest: RemoteMirrorManifest = {
    eventCount,
    host: options.host,
    identityFetched,
    identityMirrorPath,
    journalMirrorPath,
    journalRemotePath,
    mirrorName,
    pulledAt: (options.now ?? (() => new Date()))().toISOString(),
  };
  await writeJsonAtomic(manifestPath, manifest);

  return {
    eventCount,
    host: options.host,
    identityFetched,
    identityMirrorPath,
    journalMirrorPath,
    manifestPath,
    mirrorName,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function pullConfiguredRemoteJournals(
  options: PullConfiguredRemoteJournalsOptions,
): Promise<PullConfiguredRemoteJournalsResult> {
  const loaded = await loadRemoteSources(options.config);
  const pulled: PullRemoteJournalResult[] = [];
  const failures: RemotePullFailure[] = [];

  for (const remote of loaded.remotes) {
    try {
      const result = await pullRemoteJournal({
        config: options.config,
        host: remote.host,
        identityPath: remote.identityPath,
        journalPath: remote.journalPath,
        name: remote.name,
        now: options.now,
        runCommand: options.runCommand,
        sshPath: options.sshPath,
      });
      pulled.push(result);
    } catch (error) {
      failures.push({
        error: formatError(error),
        host: remote.host,
        name: remote.name,
      });
    }
  }

  return {
    configuredCount: loaded.remotes.length,
    configExists: loaded.configExists,
    configPath: loaded.configPath,
    failures,
    pulled,
  };
}
