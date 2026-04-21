import * as os from 'node:os';
import * as fs from 'fs-extra';
import { constants } from 'node:fs';
import * as path from 'node:path';

import { getPersonalAutomationState, resolvePersonalPaths } from '../bootstrap/personal';
import { UrchinConfig } from './config';
import { loadState, SourceSyncState } from './state';
import { EventSource } from '../types';

export interface DoctorPathReport {
  path: string;
  exists: boolean;
}

export interface DoctorSourceReport {
  source: EventSource;
  label: string;
  category: 'collector' | 'intake';
  shipped: true;
  status: 'ready' | 'partial' | 'missing';
  note: string;
  paths: DoctorPathReport[];
  runtime: SourceSyncState | null;
  details?: Record<string, number | string | boolean>;
}

export interface DoctorSpikeReport {
  id: string;
  status: 'planned' | 'shipped';
  note: string;
}

export interface DoctorReport {
  automation: {
    envPath: string;
    envExists: boolean;
    personalNotePath: string;
    personalNoteExists: boolean;
    servicePath: string;
    serviceInstalled: boolean;
    systemdAvailable: boolean;
    timerActive: boolean | null;
    timerEnabled: boolean | null;
    timerPath: string;
    timerInstalled: boolean;
  };
  generatedAt: string;
  overallStatus: 'ok' | 'warning';
  vault: {
    root: string;
    exists: boolean;
    writable: boolean;
    archiveRoot: string;
    archiveRootExists: boolean;
    statePath: string;
    stateFileExists: boolean;
  };
  sync: {
    lastSuccessfulSyncAt: string | null;
    lastSyncStartedAt: string | null;
    connectedSourceCount: number;
    shippedSourceCount: number;
  };
  sources: DoctorSourceReport[];
  spikes: DoctorSpikeReport[];
}

export interface DoctorOptions {
  homeRoot?: string;
}

interface SourceSpec {
  source: EventSource;
  label: string;
  category: 'collector' | 'intake';
  note: string;
  paths: (config: UrchinConfig) => string[];
  status: (paths: DoctorPathReport[]) => DoctorSourceReport['status'];
  details?: (config: UrchinConfig, paths: DoctorPathReport[]) => Promise<Record<string, number | string | boolean> | undefined>;
}

const SOURCE_SPECS: SourceSpec[] = [
  {
    source: 'browser',
    label: 'Generic intake queue',
    category: 'intake',
    note: 'Shipped append-only intake for browser, editor, and other bridge-fed events.',
    paths: (config) => [config.intakeRoot],
    status: ([root]) => (root?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'copilot',
    label: 'Copilot session-state collector',
    category: 'collector',
    note: 'Reads Copilot CLI session-state event logs, including async agent lifecycle events.',
    paths: (config) => [config.copilotSessionRoot],
    status: ([root]) => (root?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'vscode',
    label: 'VS Code bridge collector',
    category: 'collector',
    note: 'Reads explicit VS Code bridge events from the local queue file for editor session capture.',
    paths: (config) => [config.vscodeEventsPath],
    status: ([file]) => (file?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'claude',
    label: 'Claude history + project collector',
    category: 'collector',
    note: 'Reads Claude history and project transcript JSONL when either durable surface exists.',
    paths: (config) => [config.claudeHistoryFile, path.join(path.dirname(config.claudeHistoryFile), 'projects')],
    status: (paths) => {
      const existing = paths.filter((entry) => entry.exists).length;
      if (existing === 2) {
        return 'ready';
      }
      if (existing === 1) {
        return 'partial';
      }
      return 'missing';
    },
  },
  {
    source: 'gemini',
    label: 'Gemini chat collector',
    category: 'collector',
    note: 'Reads Gemini local chat artifacts from the configured temp root.',
    paths: (config) => [config.geminiTmpRoot],
    status: ([root]) => (root?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'openclaw',
    label: 'OpenClaw command collector',
    category: 'collector',
    note: 'Reads append-style OpenClaw command logs when present.',
    paths: (config) => [config.openclawCommandsLog],
    status: ([file]) => (file?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'shell',
    label: 'Shell history collector',
    category: 'collector',
    note: 'Reads recent shell history from the configured shell history file.',
    paths: (config) => [config.shellHistoryFile],
    status: ([file]) => (file?.exists ? 'ready' : 'missing'),
  },
  {
    source: 'git',
    label: 'Git activity collector',
    category: 'collector',
    note: 'Reads git commit history from configured repo roots.',
    paths: (config) => config.reposRoots,
    status: (paths) => {
      const existing = paths.filter((entry) => entry.exists).length;
      if (existing === paths.length && existing > 0) {
        return 'ready';
      }
      if (existing > 0) {
        return 'partial';
      }
      return 'missing';
    },
    details: async (config, paths) => {
      let discoveredRepos = 0;
      for (const entry of paths) {
        if (!entry.exists) {
          continue;
        }

        const children = await fs.readdir(entry.path).catch(() => []);
        for (const child of children) {
          if (await fs.pathExists(path.join(entry.path, child, '.git'))) {
            discoveredRepos += 1;
          }
        }
      }

      return {
        configuredRoots: config.reposRoots.length,
        reachableRoots: paths.filter((entry) => entry.exists).length,
        discoveredRepos,
      };
    },
  },
];

const SPIKE_REPORTS: DoctorSpikeReport[] = [
  {
    id: 'editor-vscode',
    status: 'shipped',
    note: 'VS Code / VSCodium now has a shipped local bridge contract through the dedicated queue file and collector.',
  },
  {
    id: 'editor-jetbrains',
    status: 'planned',
    note: 'JetBrains editor bridge is still a contract target, not a shipped integration.',
  },
  {
    id: 'editor-neovim',
    status: 'planned',
    note: 'Neovim or terminal-editor plugin bridge is still planned, not implemented.',
  },
  {
    id: 'promotion-beyond-archive',
    status: 'shipped',
    note: 'Promotion now updates project notes, the Urchin resource note, and explicit decision ledgers through managed provenance-backed sections.',
  },
];

async function canWrite(targetPath: string): Promise<boolean> {
  let current = targetPath;

  while (true) {
    if (await fs.pathExists(current)) {
      try {
        await fs.access(current, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

async function inspectPaths(paths: string[]): Promise<DoctorPathReport[]> {
  return Promise.all(
    paths.map(async (targetPath) => ({
      path: targetPath,
      exists: await fs.pathExists(targetPath),
    })),
  );
}

export async function buildDoctorReport(
  config: UrchinConfig,
  now: () => Date = () => new Date(),
  options: DoctorOptions = {},
): Promise<DoctorReport> {
  const homeRoot = options.homeRoot ?? os.homedir();
  const state = await loadState(config.statePath);
  const vaultExists = await fs.pathExists(config.vaultRoot);
  const archiveRootExists = await fs.pathExists(config.archiveRoot);
  const stateFileExists = await fs.pathExists(config.statePath);
  const personalPaths = resolvePersonalPaths(config, homeRoot);
  const personalState = await getPersonalAutomationState(homeRoot);
  const [
    envExists,
    personalNoteExists,
    serviceInstalled,
    timerInstalled,
  ] = await Promise.all([
    fs.pathExists(personalPaths.envPath),
    fs.pathExists(personalPaths.notePath),
    fs.pathExists(personalPaths.servicePath),
    fs.pathExists(personalPaths.timerPath),
  ]);

  const sources = await Promise.all(
    SOURCE_SPECS.map(async (spec) => {
      const paths = await inspectPaths(spec.paths(config));
      return {
        source: spec.source,
        label: spec.label,
        category: spec.category,
        shipped: true,
        status: spec.status(paths),
        note: spec.note,
        paths,
        runtime: state.sources?.[spec.source] ?? null,
        ...(spec.details ? { details: await spec.details(config, paths) } : {}),
      } satisfies DoctorSourceReport;
    }),
  );

  const connectedSourceCount = sources.filter((source) => source.status === 'ready' || source.status === 'partial').length;
  const hasRuntimeFailures = sources.some((source) => Boolean(source.runtime?.lastError));
  const writable = await canWrite(config.archiveRoot);
  const overallStatus: DoctorReport['overallStatus'] =
    writable && connectedSourceCount > 0 && !hasRuntimeFailures ? 'ok' : 'warning';

  return {
    automation: {
      envExists,
      envPath: personalPaths.envPath,
      personalNoteExists,
      personalNotePath: personalPaths.notePath,
      serviceInstalled,
      servicePath: personalPaths.servicePath,
      systemdAvailable: personalState.systemdAvailable,
      timerActive: personalState.timerActive,
      timerEnabled: personalState.timerEnabled,
      timerInstalled,
      timerPath: personalPaths.timerPath,
    },
    generatedAt: now().toISOString(),
    overallStatus,
    vault: {
      root: config.vaultRoot,
      exists: vaultExists,
      writable,
      archiveRoot: config.archiveRoot,
      archiveRootExists,
      statePath: config.statePath,
      stateFileExists,
    },
    sync: {
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt ?? null,
      lastSyncStartedAt: state.lastSyncStartedAt ?? null,
      connectedSourceCount,
      shippedSourceCount: sources.length,
    },
    sources,
    spikes: SPIKE_REPORTS,
  };
}
