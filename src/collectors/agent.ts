import * as fs from 'fs-extra';
import * as path from 'node:path';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, EventKind, UrchinEvent } from '../types';

interface AgentQueueEntry {
  agent?: unknown;
  agentType?: unknown;
  content?: unknown;
  filePath?: unknown;
  id?: unknown;
  kind?: unknown;
  model?: unknown;
  role?: unknown;
  sessionId?: unknown;
  status?: unknown;
  summary?: unknown;
  timestamp?: unknown;
  title?: unknown;
  workspacePath?: unknown;
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toKind(value: unknown): EventKind {
  if (value === 'conversation') {
    return 'conversation';
  }

  return 'agent';
}

function summarize(entry: AgentQueueEntry, content: string, agentName: string): string {
  const explicit = toString(entry.summary);
  if (explicit) {
    return sanitize(explicit, 140);
  }

  const status = toString(entry.status);
  const title = toString(entry.title);
  if (status && title) {
    return sanitize(`${agentName} ${status} — ${title}`, 140);
  }
  if (status) {
    return sanitize(`${agentName} ${status}`, 140);
  }
  if (title) {
    return sanitize(`${agentName} — ${title}`, 140);
  }

  return sanitize(content, 140).split('\n')[0] ?? `${agentName} event`;
}

function repoFromWorkspace(workspacePath: string | undefined): string | undefined {
  if (!workspacePath) {
    return undefined;
  }

  const base = path.basename(workspacePath);
  return base && base !== '.' && base !== path.sep ? sanitize(base, 120) : undefined;
}

export class AgentCollector implements Collector {
  name: 'agent' = 'agent';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.agentEventsPath))) {
      return [];
    }

    const raw = await fs.readFile(this.config.agentEventsPath, 'utf8');
    const events: UrchinEvent[] = [];

    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const entry = JSON.parse(line) as AgentQueueEntry;
        const timestamp = new Date(toString(entry.timestamp) ?? Date.now());
        if (since && timestamp < since) {
          continue;
        }

        const content = toString(entry.content);
        const agentName = toString(entry.agent);
        if (!content || !agentName) {
          continue;
        }

        const workspacePath = toString(entry.workspacePath);
        const filePath = toString(entry.filePath);
        const sessionId = toString(entry.sessionId);
        const model = toString(entry.model);
        const role = toString(entry.role);
        const status = toString(entry.status);
        const title = toString(entry.title);
        const agentType = toString(entry.agentType);
        const repo = repoFromWorkspace(workspacePath);

        events.push({
          id: toString(entry.id) ?? `agent-${agentName}-${sessionId ?? timestamp.toISOString()}`,
          kind: toKind(entry.kind),
          source: 'agent',
          timestamp: timestamp.toISOString(),
          summary: summarize(entry, content, agentName),
          content,
          tags: ['agent-bridge', sanitize(agentName.toLowerCase(), 60), ...(status ? [sanitize(status.toLowerCase(), 40)] : [])],
          metadata: {
            agent: agentName,
            ...(agentType ? { agentType } : {}),
            ...(filePath ? { filePath } : {}),
            ...(model ? { model } : {}),
            ...(role ? { role } : {}),
            ...(status ? { status } : {}),
            ...(title ? { title } : {}),
            ...(workspacePath ? { workspacePath } : {}),
          },
          provenance: {
            adapter: 'agent-bridge-jsonl',
            location: this.config.agentEventsPath,
            scope: 'local',
            ...(repo ? { repo } : {}),
            ...(sessionId ? { sessionId } : {}),
          },
        });
      } catch {
        // Skip malformed queue entries.
      }
    }

    return events;
  }
}
