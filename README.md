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

- `urchin init --mode existing` — wire Urchin into an existing vault without destructive scaffolding
- `urchin init --mode starter --vault /path/to/vault` — scaffold a starter vault layout for Urchin
- `urchin` or `urchin sync` — collect recent activity and write timeline notes
- `urchin dump "text"` — append a manual capture into the Obsidian inbox
- `urchin ingest --source browser --kind capture --scope network "captured text"` — append an external/browser-style event into the bounded intake queue
- `urchin status` — show resolved config and sync state

If a collector fails during `urchin sync`, Urchin now refuses to advance the sync checkpoint. That keeps the next run from silently skipping activity.

## Setup

```bash
npm install
npm run build
node dist/src/index.js init --mode existing
node dist/src/index.js status
```

Urchin defaults to the local paths used in this workflow, but every important path is configurable:

| Variable | Default |
| --- | --- |
| `URCHIN_VAULT_ROOT` | `~/brain` |
| `URCHIN_ARCHIVE_ROOT` | `~/brain/40-archive/urchin` |
| `URCHIN_STATE_PATH` | `~/.local/state/urchin/state.json` |
| `URCHIN_INBOX_CAPTURE_PATH` | `~/brain/00-inbox/urchin-capture.md` |
| `URCHIN_INTAKE_ROOT` | `~/.local/share/urchin/intake` |
| `URCHIN_COPILOT_SESSION_ROOT` | `~/.copilot/session-state` |
| `URCHIN_CLAUDE_HISTORY_FILE` | `~/.claude/history.jsonl` |
| `URCHIN_GEMINI_TMP_ROOT` | `~/.gemini/tmp` |
| `URCHIN_OPENCLAW_COMMANDS_LOG` | `~/.openclaw/logs/commands.log` |
| `URCHIN_PROJECT_ALIAS_PATH` | `~/.config/urchin/project-aliases.json` |
| `URCHIN_SHELL_HISTORY_FILE` | `~/.bash_history` |
| `URCHIN_REPOS_ROOTS` | `~/dev,~/repos` |

For day-to-day use, start with `urchin status`, confirm the resolved paths, then run `urchin sync`.

`URCHIN_PROJECT_ALIAS_PATH` lets you pin repo or workspace names to real project notes when the names do not line up exactly.

Urchin now supports two install modes:

- **existing** — create only the inbox/archive wiring Urchin needs inside an existing vault
- **starter** — scaffold a minimal vault structure for people adopting Urchin as the beginning of a second brain

See [`docs/editor-contract.md`](docs/editor-contract.md) for the first-class editor/IDE direction.

## Development

```bash
npm install
npm run typecheck
npm test
```

Real development should use live local logs where possible, then confirm Urchin still writes clean archive notes into the vault.
