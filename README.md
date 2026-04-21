# Urchin

Urchin is a local-first context bridge that pulls scattered AI and workflow activity into an Obsidian brain without turning the vault into a dumping ground.

## Current direction

- **Core first:** config, provenance, redaction, checkpoints, deterministic vault writes
- **Spikes later:** source adapters, intake adapters, enrichers, output writers
- **Vault-aware:** archive layers live in the vault, but promotion into durable notes stays explicit

## Commands

- `urchin` or `urchin sync` — collect recent activity and write timeline notes
- `urchin dump "text"` — append a manual capture into the Obsidian inbox
- `urchin status` — show resolved config and sync state

## Development

```bash
npm install
npm run typecheck
npm test
```
