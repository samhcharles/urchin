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

function quoteRemoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
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
