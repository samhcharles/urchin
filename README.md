# Urchin

Urchin is a local-first context bridge that pulls scattered AI and workflow activity into an Obsidian brain without turning the vault into a dumping ground.

## Current direction

- **Core first:** config, provenance, redaction, checkpoints, deterministic vault writes
- **Spikes later:** source adapters, intake adapters, enrichers, output writers
- **Vault-aware:** archive layers live in the vault, but promotion into durable notes stays explicit

## Current outputs

- `40-archive/urchin/daily/` — day timelines across all synced sources
- `40-archive/urchin/projects/` — project-scoped activity notes when Urchin can infer repo or project context
- `40-archive/urchin/triage/` — low-confidence capture review notes
- `40-archive/urchin/index.md` — top-level archive index

See [`docs/architecture.md`](docs/architecture.md) for the core-plus-spikes model and intake contract.

## Commands

- `urchin` or `urchin sync` — collect recent activity and write timeline notes
- `urchin dump "text"` — append a manual capture into the Obsidian inbox
- `urchin ingest --source browser --kind capture --scope network "captured text"` — append an external/browser-style event into the bounded intake queue
- `urchin status` — show resolved config and sync state

## Development

```bash
npm install
npm run typecheck
npm test
```

Real development should use live local logs where possible, then confirm Urchin still writes clean archive notes into the vault.
