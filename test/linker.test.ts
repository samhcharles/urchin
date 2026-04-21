import assert from 'node:assert/strict';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { Linker } from '../src/synthesis/linker';

test('Linker resolves project names using aliases and heuristics', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-linker-'));
  const vaultRoot = path.join(root, 'vault');
  const aliasPath = path.join(root, '.config', 'urchin', 'project-aliases.json');

  try {
    await fs.ensureDir(path.join(vaultRoot, '10-projects'));
    await fs.writeFile(path.join(vaultRoot, '10-projects', 'openclaw.md'), '# OpenClaw\n', 'utf8');
    await fs.writeFile(path.join(vaultRoot, '10-projects', 'chopsticks-lean.md'), '# Chopsticks Lean\n', 'utf8');
    await fs.writeFile(path.join(vaultRoot, '10-projects', 'vps-infrastructure.md'), '# VPS Infrastructure\n', 'utf8');
    await fs.ensureDir(path.dirname(aliasPath));
    await fs.writeJson(aliasPath, {
      'control-plane': 'vps-infrastructure',
    });

    const linker = new Linker(vaultRoot, aliasPath);
    await linker.initialize();

    assert.equal(linker.resolveProjectName('openclaw-workspace-braindump'), 'openclaw');
    assert.equal(linker.resolveProjectName('chopsticks-lean-prod'), 'chopsticks-lean');
    assert.equal(linker.resolveProjectName('control-plane'), 'vps-infrastructure');
    assert.equal(linker.resolveProjectName('unknown-repo'), undefined);
  } finally {
    await fs.remove(root);
  }
});
