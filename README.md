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
- Copilot background task/agent launches and terminal results now land as first-class archive events when they are present in session-state logs
- selected high-signal events can now update project notes, the Urchin resource note, and explicit decision ledgers through managed provenance-backed sections

See [`docs/architecture.md`](docs/architecture.md) for the core-plus-spikes model and intake contract.

## Commands

- `urchin init --mode existing` — wire Urchin into an existing vault without destructive scaffolding
- `urchin init --mode starter --vault /path/to/vault` — scaffold a starter vault layout for Urchin
- `urchin setup-personal --mode existing --enable true` — write a personal env file, systemd timer, and personal-use note for the real daily workflow
- `urchin` or `urchin sync` — collect recent activity and write timeline notes
- `urchin dump "text"` — append a manual capture into the Obsidian inbox
- `urchin ingest --source browser --kind capture --scope network "captured text"` — append an external/browser-style event into the bounded intake queue
- `urchin ingest-agent --agent codex --workspace urchin --status completed "message"` — append a generic local agent event into the dedicated agent bridge queue
- `urchin ingest-vscode --workspace /repo --session chat-1 --file /repo/src/app.ts --role assistant "message"` — append a VS Code bridge event into the dedicated editor queue
- `urchin mcp` — start the MCP server (stdio transport) for use with Claude Code and other MCP clients
- `urchin status` — show resolved config and sync state
- `urchin doctor` — show blunt runtime diagnostics: what is shipped, what is reachable, what last ran, and what is still only planned

## MCP server

`urchin mcp` exposes three tools over stdio:

| Tool | Description |
|---|---|
| `urchin_ingest` | Record an activity event into the VS Code bridge queue. Params: `content`, `workspace` (required); `session`, `title`, `file`, `role`, `kind` (optional). |
| `urchin_recent_activity` | Recent events across all sources. Params: `hours` (default 24), `source`, `limit` (default 20). |
| `urchin_project_context` | Events matched to a project by name. Params: `project` (required), `hours` (default 168), `limit` (default 30). |
| `urchin_search` | Full-text search over summary and content. Params: `query` (required), `hours` (default 168), `limit` (default 20). |

The read tools (`urchin_recent_activity`, `urchin_project_context`, `urchin_search`) read from a rolling 30-day JSONL event cache (`~/.local/share/urchin/event-cache.jsonl`) written during each `urchin sync`. Run at least one sync before querying.

`urchin_ingest` writes directly to the VS Code bridge queue (`URCHIN_VSCODE_EVENTS_PATH`) — no sync needed, the write is immediate.

### VS Code auto-capture

Urchin is registered in `~/.config/Code/User/mcp.json`. Claude in VS Code can call `urchin_ingest` at the end of a session to self-report what it worked on:

```
Use urchin_ingest to record this session before we finish.
workspace: /home/samhc/dev/urchin
content: Implemented the MCP server with urchin_ingest and wired it into VS Code.
```

The event lands in the VS Code queue and is picked up by the next `urchin sync`.

**Wire into Claude Code** — add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "urchin": {
      "command": "node",
      "args": ["/path/to/urchin/dist/src/index.js", "mcp"]
    }
  }
}
```

After adding the entry, restart Claude Code. The three tools appear under `@urchin` in any session.

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
| `URCHIN_AGENT_EVENTS_PATH` | `~/.local/share/urchin/agents/events.jsonl` |
| `URCHIN_EVENT_CACHE_PATH` | `~/.local/share/urchin/event-cache.jsonl` |
| `URCHIN_VAULT_ROOT` | `~/brain` |
| `URCHIN_ARCHIVE_ROOT` | `~/brain/40-archive/urchin` |
| `URCHIN_STATE_PATH` | `~/.local/state/urchin/state.json` |
| `URCHIN_INBOX_CAPTURE_PATH` | `~/brain/00-inbox/urchin-capture.md` |
| `URCHIN_INTAKE_ROOT` | `~/.local/share/urchin/intake` |
| `URCHIN_COPILOT_SESSION_ROOT` | `~/.copilot/session-state` |
| `URCHIN_CLAUDE_HISTORY_FILE` | `~/.claude/history.jsonl` |
| `URCHIN_GEMINI_TMP_ROOT` | `~/.gemini/tmp` |
| `URCHIN_OPENCLAW_COMMANDS_LOG` | `~/.openclaw/logs/commands.log` |
| `URCHIN_OPENCLAW_CRON_RUNS_DIR` | `~/.openclaw/cron/runs` |
| `URCHIN_PROJECT_ALIAS_PATH` | `~/.config/urchin/project-aliases.json` |
| `URCHIN_GIT_AUTHOR` | unset (falls back to repo `git config user.name`) |
| `URCHIN_SHELL_HISTORY_FILE` | `~/.bash_history` |
| `URCHIN_SHELL_IGNORE_PREFIXES` | `cd,ls,pwd,clear,history,exit` |
| `URCHIN_SHELL_MIN_COMMAND_LENGTH` | `8` |
| `URCHIN_REPOS_ROOTS` | `~/dev,~/repos` |
| `URCHIN_TIMER_CADENCE` | `5m` |
| `URCHIN_VSCODE_WORKSPACE_ALIASES_PATH` | `~/.config/urchin/vscode-workspaces.json` |
| `URCHIN_VSCODE_EVENTS_PATH` | `~/.local/share/urchin/editors/vscode/events.jsonl` |

For day-to-day use, start with `urchin setup-personal --enable true`, then use `urchin doctor` to confirm the timer, reachable sources, and runtime state.

`URCHIN_PROJECT_ALIAS_PATH` lets you pin repo or workspace names to real project notes when the names do not line up exactly.

## Personal workflow

If you want Urchin to feel like part of your real stack instead of a repo you manually poke:

```bash
npm install
npm run build
node dist/src/index.js setup-personal --mode existing --enable true
node dist/src/index.js doctor
```

That writes:

- a personal env file at `~/.config/urchin/personal.env`
- a user service and timer at `~/.config/systemd/user/urchin.{service,timer}`
- a personal operating note at `30-resources/ai/urchin-personal.md`

The timer keeps `urchin sync` moving in the background on a steady cadence, and the note gives you one place in the vault to check the current working setup.

If you want faster VS Code capture without retyping full workspace paths, add aliases in `~/.config/urchin/vscode-workspaces.json`:

```json
{
  "urchin": "/home/samhc/dev/urchin"
}
```

Then you can do:

```bash
urchin ingest-vscode --workspace urchin "Shipped a stronger sync summary"
```

The same local-first bridge pattern now applies to unsupported or custom agent runtimes:

```bash
urchin ingest-agent \
  --agent codex \
  --workspace urchin \
  --status completed \
  --model gpt-5.4 \
  "Finished the collector pass"
```

That is not fake native Codex support. It is a real append-only bridge contract that lets Codex-style or custom agents land in the same sync pipeline once they can emit durable local events.

Urchin now supports two install modes:

- **existing** — create only the inbox/archive wiring Urchin needs inside an existing vault
- **starter** — scaffold a minimal vault structure for people adopting Urchin as the beginning of a second brain

See [`docs/editor-contract.md`](docs/editor-contract.md) for the first-class editor/IDE direction and [`docs/agent-contract.md`](docs/agent-contract.md) for the generic agent bridge contract.

## Development

```bash
npm install
npm run typecheck
npm test
```

Real development should use live local logs where possible, then confirm Urchin still writes clean archive notes into the vault.
