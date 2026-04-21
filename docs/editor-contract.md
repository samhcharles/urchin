# Editor Integration Contract

Urchin should treat editors as **first-class context surfaces**, not as second-tier extras behind CLI tooling.

## What counts as an editor surface

- chat panes in editors
- agent panes or assistant panels
- workspace/session metadata
- extension-fed event streams
- file and workspace context that explains what a conversation was attached to

## Native adapter targets

Urchin should support native adapters whenever an editor exposes durable local state:

- VS Code / VSCodium chat exports or extension storage
- JetBrains local assistant logs or workspace metadata
- Neovim or terminal-editor plugins that emit append-only local events
- any editor assistant that writes durable local transcripts

## Generic editor bridge

When an editor does not expose a stable local transcript by default, Urchin should accept a narrow bridge:

1. editor extension or plugin emits append-only events
2. events land in a local queue or intake file
3. Urchin sanitizes, dedupes, routes, and writes them like any other source

That keeps the contract simple:

- editor side: emit durable events with provenance
- Urchin side: normalize and sync

## Shipped bridge: VS Code / VSCodium

Urchin now ships one explicit editor path:

1. a VS Code extension, script, or local automation writes append-only JSONL to `URCHIN_VSCODE_EVENTS_PATH`
2. each event includes:
   - `workspacePath`
   - `sessionId`
   - `content`
3. optional fields like `filePath`, `role`, `selection`, `title`, and `kind` enrich the archive output
4. `urchin sync` reads that queue through the dedicated `VSCodeCollector`

Urchin also exposes a local CLI bridge for testing or simple integrations:

```bash
urchin ingest-vscode \
  --workspace /path/to/repo \
  --session chat-1 \
  --file /path/to/repo/src/app.ts \
  --role assistant \
  --title "Copilot Chat" \
  "Explained the refactor"
```

That is enough to make editor activity a shipped surface instead of a docs-only promise.

## Required provenance for editor events

Editor-aware events should carry enough context to be useful later:

- editor name
- workspace path
- file path or selection context when available
- agent/chat/session identifier
- event timestamp
- source location of the durable record

## Guardrails

- no fake “we know everything from your IDE” claims
- no silent background scraping without a real local surface
- no editor-specific logic inside the core sync pipeline
- adapters and bridges stay at the spike layer

## Product meaning

The user story is:

> install Urchin once, connect your vault, and your CLI agents, editor agents, repo activity, and other supported local surfaces start flowing into the same brain.

That is the real value: fewer disconnected memory silos, not more hidden automation.
