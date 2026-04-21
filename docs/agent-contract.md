# Agent Bridge Contract

Urchin should unify agent work through **real local surfaces**, not vague claims.

## What this bridge is for

Use the generic agent bridge when:

- a runtime does not yet have a native Urchin collector
- the tool can still emit durable local events
- you want Codex-style tools, custom agents, or other local agent runtimes to land in the same archive/promotion pipeline

This is a bridge contract, not fake native support.

## Queue path

Urchin reads append-only JSONL from:

- `URCHIN_AGENT_EVENTS_PATH`

Default:

- `~/.local/share/urchin/agents/events.jsonl`

## Minimum event shape

```json
{
  "agent": "codex",
  "sessionId": "urchin-2026-04-21",
  "content": "Finished the collector pass",
  "timestamp": "2026-04-21T08:00:00.000Z"
}
```

## Optional fields

```json
{
  "id": "evt-1",
  "agent": "codex",
  "agentType": "general-purpose",
  "kind": "agent",
  "status": "completed",
  "model": "gpt-5.4",
  "title": "Collector pass",
  "workspacePath": "/home/user/dev/urchin",
  "filePath": "/home/user/dev/urchin/src/index.ts",
  "role": "assistant",
  "summary": "Codex completed the collector pass",
  "content": "Finished the collector pass",
  "sessionId": "urchin-2026-04-21",
  "timestamp": "2026-04-21T08:00:00.000Z"
}
```

## CLI helper

Urchin exposes a simple local bridge command:

```bash
urchin ingest-agent \
  --agent codex \
  --workspace urchin \
  --status completed \
  --model gpt-5.4 \
  "Finished the collector pass"
```

## Guardrails

- no hidden scraping
- no hosted relay
- no native support claim unless a real collector exists
- all events still go through sanitize, dedupe, routing, archive writing, and promotion rules
