# Urchin

**Context substrate for AI-heavy workflows.**

You use Claude, Copilot, Gemini, Codex, VS Code, the shell. Each one starts fresh. Each one has its own history, its own memory, its own idea of what you worked on. There is no shared substrate — so you repeat yourself, lose context between tools, and nothing ever feels connected.

Urchin fixes that. It collects activity from every tool you use, archives it into an Obsidian vault, and exposes it back as queryable context through an MCP server and an HTTP intake endpoint. One sync cadence. One archive. Every tool connected.

Under the hood, Urchin now keeps a canonical append-only machine journal beneath the rolling cache
and vault projections. Vault notes stay human-readable; the journal stays machine-readable.

```
Claude ──┐
Copilot ─┤                     ┌─ MCP tools (urchin_status, urchin_recent_activity...)
Gemini ──┤                     │   └── Claude Code, VS Code, Cursor, Continue.dev
Codex ───┼──► Urchin core ────►├─ Obsidian vault archive (daily/ projects/ triage/)
shell ───┤    (sync, dedupe,   │   └── readable by any agent, any session
git ─────┤     redact, write)  └─ HTTP /ingest endpoint
VS Code ─┤                         └── Gemini, aider, scripts, browsers, VPS agents
OpenClaw-┘
```

This is not a note-taking app or a memory layer bolted onto one tool. It is infrastructure — like git, but for context.

---

## Orinadus planning docs

For public-facing positioning and launch copy built on top of Urchin, see:

- `docs/orinadus/homepage-messaging.md`
- `docs/orinadus/available-now-vs-next.md`
- `docs/orinadus/waitlist-intake.md`
- `docs/orinadus/site/` (simple static website starter)

---

## What it captures

| Source | How |
|---|---|
| **Claude** | Reads `~/.claude/history.jsonl` and project transcripts |
| **Copilot CLI** | Reads `~/.copilot/session-state/` session logs and agent events |
| **Gemini CLI** | Reads `~/.gemini/tmp/*/chats/*.json` |
| **VS Code** | Bridge queue at `URCHIN_VSCODE_EVENTS_PATH` — populated via MCP or CLI |
| **Shell** | Reads `~/.bash_history`, filters noise |
| **Git** | Reads commit history across your repo roots |
| **OpenClaw** | Reads command log and cron run JSONL from agent orchestration |
| **Agent bridge** | Generic JSONL queue for Codex-style or custom runtimes |
| **HTTP intake** | POST to `/ingest` from any tool, script, browser, or remote agent |

---

## Quick start

```bash
git clone https://github.com/samhcharles/urchin
cd urchin
npm install
npm run build

# Wire into an existing Obsidian vault
node dist/src/index.js init --mode existing

# Or scaffold a minimal vault layout from scratch
node dist/src/index.js init --mode starter --vault ~/brain

# Set up the background sync timer
node dist/src/index.js setup-personal --mode existing --enable true

# Confirm everything is wired
node dist/src/index.js doctor
```

Set `URCHIN_VAULT_ROOT` to your vault path if it is not at `~/brain`. Every path is configurable — see [Configuration](#configuration).

---

## MCP server

```bash
node dist/src/index.js mcp
```

Wire into Claude Code (`~/.claude/settings.json`) or VS Code (`~/.config/Code/User/mcp.json`):

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

Five tools available in any MCP-capable session:

| Tool | When to call it |
|---|---|
| `urchin_status` | **Start of every session** — confirms sync is live, shows last sync time and event count |
| `urchin_ingest` | **End of every session** — records what was worked on. Params: `content`, `workspace` (required); `source`, `title`, `kind`, `tags` (optional) |
| `urchin_recent_activity` | Need context on what was done across all tools. Params: `hours` (default 24), `source`, `limit` |
| `urchin_project_context` | Need context scoped to one repo or project. Params: `project` (required), `hours`, `limit` |
| `urchin_search` | Find when a topic was last touched. Params: `query` (required), `hours`, `limit` |

The read tools (`urchin_recent_activity`, `urchin_project_context`, `urchin_search`) read from a rolling 30-day JSONL event cache written during each sync. The write tool (`urchin_ingest`) writes immediately — no sync required.

Add a global instruction to your AI tool's config file to make this automatic:

```markdown
# ~/.claude/CLAUDE.md  (Claude Code)
# ~/.gemini/GEMINI.md  (Gemini CLI)

## Context sync
Urchin is running. Call urchin_status at the start of this session.
Call urchin_ingest at the end with a summary of what was worked on.
```

---

## HTTP intake server

For tools that cannot use MCP — Gemini CLI, aider, shell scripts, browser extensions, remote VPS agents:

```bash
# Start the server (auto-selects a free port)
node dist/src/index.js serve

# Or generate and enable a machine-specific systemd user service
node dist/src/index.js setup-intake --enable true
```

`setup-intake` writes the user service with the real local `node` path, the real built Urchin
script path, and the same env file Urchin uses for personal setup. That avoids the drift of a static
unit file pointing at a binary that may not exist on the current machine.

The live port is written to `~/.local/state/urchin/intake.port` at startup. Read it from anywhere:

```bash
PORT=$(cat ~/.local/state/urchin/intake.port 2>/dev/null || echo 18799)

# Record an event
curl -s -X POST "http://127.0.0.1:$PORT/ingest" \
  -H 'Content-Type: application/json' \
  -d '{"content":"what was done","source":"gemini","kind":"conversation"}'

# Health check
curl -s "http://127.0.0.1:$PORT/health"
```

**Shell alias:**

```bash
# Add to ~/.bashrc
urchin-log() {
  local port=$(cat ~/.local/state/urchin/intake.port 2>/dev/null || echo 18799)
  curl -s -X POST "http://127.0.0.1:$port/ingest" \
    -H 'Content-Type: application/json' \
    -d "{\"content\":$(printf '%s' "$*" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),\"source\":\"shell\"}"
}

# Use it
urchin-log "deployed the new API to VPS, tested health endpoint"
```

**Ingest event shape:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `content` | string | ✓ | What was done |
| `source` | string | | `claude`, `copilot`, `gemini`, `shell`, `vscode`, `agent`, `browser`, `manual` |
| `kind` | string | | `conversation`, `agent`, `capture`, `activity`, `ops`, `code` |
| `summary` | string | | Short label (defaults to first 140 chars of content) |
| `tags` | string[] | | Additional tags for routing and search |
| `sessionId` | string | | Group related events into a session |
| `metadata` | object | | Arbitrary structured data |

---

## Commands

```bash
urchin                                         # run sync
urchin sync                                    # same as above
urchin mcp                                     # start MCP server (stdio)
urchin serve                                   # start HTTP intake server
urchin dump "text"                             # append manual capture to vault inbox
urchin ingest --source shell "text"            # append to intake queue
urchin ingest-agent --agent codex "text"       # append to agent bridge queue
urchin ingest-vscode --workspace /path "text"  # append to VS Code bridge queue
urchin init --mode existing                    # wire into existing vault
urchin setup-intake --enable true              # write and enable machine-specific intake service
urchin init --mode starter --vault ~/brain     # scaffold new vault layout
urchin setup-personal --enable true            # write systemd timer, env file, personal note
urchin identity                                # print resolved node identity and its source
urchin identity --write true --device vps-1    # persist actor/account/device identity for this node
urchin pull-remote --name vps --host user@host # mirror a remote node journal over SSH into local sync
urchin pull-remotes                            # mirror every configured remote source
urchin status                                  # print resolved config and last sync state
urchin doctor                                  # runtime diagnostics — what works, what is missing
```

---

## Configuration

All paths are configurable via environment variables. Set them in `~/.config/urchin/personal.env`.

| Variable | Default |
|---|---|
| `URCHIN_VAULT_ROOT` | `~/brain` |
| `URCHIN_ARCHIVE_ROOT` | `~/brain/40-archive/urchin` |
| `URCHIN_STATE_PATH` | `~/.local/state/urchin/state.json` |
| `URCHIN_INTAKE_PORT` | `18799` (auto-increments if busy) |
| `URCHIN_INTAKE_PORT_FILE` | `~/.local/state/urchin/intake.port` |
| `URCHIN_INTAKE_ROOT` | `~/.local/share/urchin/intake` |
| `URCHIN_EVENT_CACHE_PATH` | `~/.local/share/urchin/event-cache.jsonl` |
| `URCHIN_EVENT_JOURNAL_PATH` | `~/.local/share/urchin/journal/events.jsonl` |
| `URCHIN_IDENTITY_PATH` | `~/.config/urchin/identity.json` |
| `URCHIN_AGENT_EVENTS_PATH` | `~/.local/share/urchin/agents/events.jsonl` |
| `URCHIN_CLAUDE_HISTORY_FILE` | `~/.claude/history.jsonl` |
| `URCHIN_COPILOT_SESSION_ROOT` | `~/.copilot/session-state` |
| `URCHIN_GEMINI_TMP_ROOT` | `~/.gemini/tmp` |
| `URCHIN_VSCODE_EVENTS_PATH` | `~/.local/share/urchin/editors/vscode/events.jsonl` |
| `URCHIN_OPENCLAW_COMMANDS_LOG` | `~/.openclaw/logs/commands.log` |
| `URCHIN_OPENCLAW_CRON_RUNS_DIR` | `~/.openclaw/cron/runs` |
| `URCHIN_REMOTE_MIRROR_ROOT` | `~/.local/share/urchin/remotes` |
| `URCHIN_SHELL_HISTORY_FILE` | `~/.bash_history` |
| `URCHIN_SHELL_IGNORE_PREFIXES` | `cd,ls,pwd,clear,history,exit` |
| `URCHIN_SHELL_MIN_COMMAND_LENGTH` | `8` |
| `URCHIN_REPOS_ROOTS` | `~/dev,~/repos` |
| `URCHIN_GIT_AUTHOR` | from `git config user.name` |
| `URCHIN_TIMER_CADENCE` | `5m` |
| `URCHIN_PROJECT_ALIAS_PATH` | `~/.config/urchin/project-aliases.json` |
| `URCHIN_VSCODE_WORKSPACE_ALIASES_PATH` | `~/.config/urchin/vscode-workspaces.json` |
| `URCHIN_INBOX_CAPTURE_PATH` | `~/brain/00-inbox/urchin-capture.md` |
| `URCHIN_REMOTE_SOURCES_PATH` | `~/.config/urchin/remotes.json` |

Urchin now persists node identity at `~/.config/urchin/identity.json` so WSL, VPS, and other nodes
can carry durable actor/account/device identity instead of depending only on transient env vars.

Identity fields in the canonical journal can still be overridden with `URCHIN_ACTOR_ID`,
`URCHIN_ACCOUNT_ID`, `URCHIN_DEVICE_ID`, and `URCHIN_DEFAULT_VISIBILITY`. Env overrides win over
the identity file. If neither exists, Urchin falls back to the local username, hostname, and
`private` visibility.

### Remote node mirror

Use this when a VPS or second machine has its own Urchin journal and you want those events pulled
into the same local sync pipeline.

```bash
urchin pull-remote --name vps --host user@2.24.29.238
urchin sync
```

`pull-remote` mirrors the remote journal into `~/.local/share/urchin/remotes/<name>/events.jsonl`.
The next `urchin sync` reads that mirror through the remote collector and lands those events in the
same archive, project notes, cache, and MCP surfaces. This is a truthful bridge, not full automatic
replication yet.

For repeatable pulls, define remote sources in `~/.config/urchin/remotes.json`:

```json
{
  "remotes": [
    {
      "name": "vps",
      "host": "user@2.24.29.238"
    }
  ]
}
```

Then either run `urchin pull-remotes` directly or let normal `urchin sync` pull configured remotes
before collecting local and mirrored events.

---

## Contributing

Urchin is built around a clean separation: **the core does not change when a new source is added**. You build a producer.

### Adding a new source

Every source is one of three things:

1. **A collector** (`src/collectors/`) — reads a local file or directory and returns `UrchinEvent[]`. Implement the `Collector` interface and register it in `src/index.ts`. See `src/collectors/gemini.ts` for a minimal example.

2. **An intake producer** — any external tool that POSTs to `POST /ingest` or appends to a JSONL queue under `URCHIN_INTAKE_ROOT`. No core changes needed. The contract is documented in [`docs/agent-contract.md`](docs/agent-contract.md) and [`docs/editor-contract.md`](docs/editor-contract.md).

3. **An MCP client integration** — an instruction file or configuration block that tells an AI tool to call `urchin_ingest` at session end. No code changes needed.

### What makes a good contribution

- A new collector for a tool with a local file trail (Cursor, Windsurf, Zed, JetBrains, Warp, etc.)
- A browser extension that POSTs to the HTTP intake endpoint
- A Neovim or JetBrains plugin that writes to the editor bridge queue
- Documentation or examples for a tool that already works but is not documented
- Tests for edge cases in existing collectors

### Running locally

```bash
npm install
npm run typecheck
npm test

# Test against real logs
node dist/src/index.js sync
node dist/src/index.js doctor
```

Tests live in `test/`. Every collector has a test fixture. Keep them passing — the build gate runs `npm test` before every merge.

---

## Roadmap

| Spike | Status | Description |
|---|---|---|
| Core sync + vault writes | ✅ shipped | Deterministic archive, dedupe, provenance, per-source checkpoints |
| MCP server | ✅ shipped | 5 tools over stdio — status, ingest, recent, project context, search |
| HTTP intake server | ✅ shipped | `urchin serve`, smart port, port file, systemd unit |
| VS Code bridge | ✅ shipped | `urchin_ingest` MCP tool + VSCode collector |
| Agent bridge | ✅ shipped | Generic JSONL queue + `urchin ingest-agent` |
| Universal awareness docs | ✅ shipped | Wiring guide for every major tool type |
| Durable node identity | ✅ shipped | Persist actor/account/device identity in `~/.config/urchin/identity.json` and surface it in status/doctor |
| Remote journal pull bridge | ✅ shipped | Mirror a remote node journal over SSH into the local sync pipeline |
| Replication foundation | 🔲 planned | Move journal continuity cleanly across WSL / Windows / VPS |
| Configured remote sync | ✅ shipped | `urchin sync` can auto-pull configured remotes from `~/.config/urchin/remotes.json` |
| VPS / remote automation | 🔲 planned | stronger service-backed or bidirectional flows beyond configured SSH pulls |
| Browser intake | 🔲 planned | Extension or bookmarklet POSTing to intake |
| Neovim plugin | 🔲 planned | Editor bridge for terminal-first workflows |
| JetBrains plugin | 🔲 planned | Native editor bridge for JetBrains IDEs |
| Orinadus starter vault | 🔲 planned | Opinionated vault scaffold with Urchin pre-wired |
| Second brain hatch flow | 🔲 planned | Guided local-first onboarding for users who do not already have a brain |

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full core-plus-spikes model, intake contracts, and output layer design.

The short version: the core (`sync`, `dedupe`, `redact`, `state`, `config`) owns stable rules. Spikes are adapters — source collectors, intake producers, output writers — that plug into the core without changing it. New surfaces are new spikes, not core changes.

---

## Part of Orinadus

Urchin is the first technology from [Orinadus](https://orinadus.com) — infrastructure for AI-heavy development workflows. The goal is simple: as the number of AI tools compounds, the memory fragmentation problem compounds with it. Urchin is the substrate that absorbs that fragmentation.

If a user already has a brain, Urchin should plug into it. If they do not, the planned Orinadus onboarding path is to hatch one cleanly without changing the substrate underneath.

If you work across multiple AI tools and the context never carries, this is built for you.
