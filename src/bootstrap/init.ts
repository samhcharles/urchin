import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinConfig } from '../core/config';
import { writeFileAtomic } from '../core/io';

export type InitMode = 'existing' | 'starter';

export interface InitOptions {
  config: UrchinConfig;
  mode: InitMode;
  vaultRoot?: string;
}

export interface InitResult {
  created: string[];
  mode: InitMode;
  reused: string[];
  vaultRoot: string;
}

const STARTER_DIRS = [
  '00-inbox',
  '10-projects',
  '20-areas',
  '30-resources',
  '30-resources/ai',
  '40-archive/urchin',
  '50-templates',
  '60-journal',
  '70-knowledge',
];

const EXISTING_DIRS = [
  '00-inbox',
  '40-archive/urchin',
];

function buildConfig(config: UrchinConfig, vaultRootOverride?: string): UrchinConfig {
  if (!vaultRootOverride) {
    return config;
  }

  const vaultRoot = path.resolve(vaultRootOverride);
  return {
    ...config,
    archiveIndexPath: path.join(vaultRoot, '40-archive', 'urchin', 'index.md'),
    archiveRoot: path.join(vaultRoot, '40-archive', 'urchin'),
    inboxCapturePath: path.join(vaultRoot, '00-inbox', 'urchin-capture.md'),
    vaultRoot,
  };
}

async function ensureDir(relativePath: string, root: string, created: string[], reused: string[]) {
  const absolutePath = path.join(root, relativePath);
  if (await fs.pathExists(absolutePath)) {
    reused.push(relativePath);
    return;
  }

  await fs.ensureDir(absolutePath);
  created.push(relativePath);
}

async function writeIfMissing(absolutePath: string, content: string, root: string, created: string[], reused: string[]) {
  const relativePath = path.relative(root, absolutePath).replace(/\\/g, '/');
  if (await fs.pathExists(absolutePath)) {
    reused.push(relativePath);
    return;
  }

  await writeFileAtomic(absolutePath, content);
  created.push(relativePath);
}

export async function initializeVault(options: InitOptions): Promise<InitResult> {
  const config = buildConfig(options.config, options.vaultRoot);
  const created: string[] = [];
  const reused: string[] = [];

  const requiredDirs = options.mode === 'starter' ? STARTER_DIRS : EXISTING_DIRS;

  for (const relativeDir of requiredDirs) {
    await ensureDir(relativeDir, config.vaultRoot, created, reused);
  }

  await writeIfMissing(
    config.inboxCapturePath,
    '# Urchin Capture\n\nManual captures land here.\n',
    config.vaultRoot,
    created,
    reused,
  );

  if (options.mode === 'starter') {
    await writeIfMissing(
      path.join(config.vaultRoot, 'HOME.md'),
      [
        '# Home',
        '',
        'This vault is ready for Urchin.',
        '',
        '- `00-inbox/` for quick capture',
        '- `10-projects/` for active work',
        '- `20-areas/` for ongoing responsibilities',
        '- `30-resources/` for references and AI/system notes',
        '- `30-resources/decisions.md` for explicit promoted decisions',
        '- `40-archive/urchin/` for synced activity',
      ].join('\n') + '\n',
      config.vaultRoot,
      created,
      reused,
    );

    await writeIfMissing(
      path.join(config.vaultRoot, '30-resources', 'ai', 'urchin.md'),
      [
        '# Urchin',
        '',
        'Urchin syncs supported local tools, agents, editor surfaces, and activity streams into this vault.',
        '',
        'Start with `urchin status`, then run `urchin sync`.',
      ].join('\n') + '\n',
      config.vaultRoot,
      created,
      reused,
    );

    await writeIfMissing(
      path.join(config.vaultRoot, '30-resources', 'decisions.md'),
      '# Decisions\n\nExplicit promoted decisions can land here.\n',
      config.vaultRoot,
      created,
      reused,
    );
  }

  await fs.ensureDir(path.dirname(config.projectAliasPath));
  if (await fs.pathExists(config.projectAliasPath)) {
    reused.push(config.projectAliasPath);
  } else {
    await writeFileAtomic(config.projectAliasPath, '{}\n');
    created.push(config.projectAliasPath);
  }

  return {
    created: created.sort(),
    mode: options.mode,
    reused: reused.sort(),
    vaultRoot: config.vaultRoot,
  };
}
