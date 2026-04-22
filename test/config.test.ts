import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/core/config';

test('loadConfig defaults to the brain vault and archive paths', () => {
  const originalVaultRoot = process.env.URCHIN_VAULT_ROOT;
  delete process.env.URCHIN_VAULT_ROOT;

  const config = loadConfig();
  assert.match(config.agentEventsPath, /urchin[\/\\]agents[\/\\]events\.jsonl$/);
  assert.match(config.vaultRoot, /brain$/);
  assert.match(config.archiveRoot, /40-archive[\/\\]urchin$/);
  assert.match(config.eventJournalPath, /urchin[\/\\]journal[\/\\]events\.jsonl$/);
  assert.match(config.identityPath, /urchin[\/\\]identity\.json$/);
  assert.match(config.remoteMirrorRoot, /urchin[\/\\]remotes$/);
  assert.equal(config.timerCadence, '5m');
  assert.match(config.vscodeEventsPath, /urchin[\/\\]editors[\/\\]vscode[\/\\]events\.jsonl$/);
  assert.match(config.vscodeWorkspaceAliasesPath, /urchin[\/\\]vscode-workspaces\.json$/);

  if (originalVaultRoot) {
    process.env.URCHIN_VAULT_ROOT = originalVaultRoot;
  }
});
