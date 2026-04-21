# Urchin Architecture

Urchin is a **local-first context bridge**. It is meant to pull scattered AI, shell, and code activity into an Obsidian vault without pretending the bridge itself is the brain.

## Core

The core owns the rules that should stay stable as adapters grow:

- canonical `UrchinEvent` envelopes
- explicit provenance
- redaction before persistence
- deterministic note writing
- incremental sync state
- dedupe

## Spikes

Spikes are adapters and outputs that plug into the core:

- source collectors: Copilot, Claude, Gemini, Git, shell, OpenClaw
- bounded append-only intake for browser or network-fed events
- archive writers for timelines, project activity, and triage

New spikes should reuse the core contracts instead of redefining storage or note formats.

## Output layers

Urchin v1 writes three archive-grade layers:

1. `daily/` timelines for replay and search
2. `projects/` activity views grouped by repo or project context
3. `triage/` notes for low-confidence captures that should be reviewed before promotion

This keeps raw activity visible while making it easier to promote useful material into durable project, area, or resource notes later.

## Intake contract

External producers should write append-only JSONL under the intake root:

```json
{"id":"...","source":"browser","kind":"capture","timestamp":"2026-04-21T08:00:00.000Z","summary":"Saved snippet","content":"...","scope":"network","sessionId":"optional"}
```

Urchin treats intake events like any other collector output: sanitize, dedupe, route, and then write with provenance preserved.

## Development guardrails

- local files first
- deterministic outputs over append-only magic
- explicit routing instead of silent rewriting
- tests around collectors and writers before expanding enrichment
- never advance sync state after a partial collector failure
