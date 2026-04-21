import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/core/config';

test('loadConfig defaults to the brain vault and archive paths', () => {
  const originalVaultRoot = process.env.URCHIN_VAULT_ROOT;
  delete process.env.URCHIN_VAULT_ROOT;

  const config = loadConfig();
  assert.match(config.vaultRoot, /brain$/);
  assert.match(config.archiveRoot, /40-archive[\/\\]urchin$/);
  assert.match(config.vscodeEventsPath, /urchin[\/\\]editors[\/\\]vscode[\/\\]events\.jsonl$/);

  if (originalVaultRoot) {
    process.env.URCHIN_VAULT_ROOT = originalVaultRoot;
  }
});
