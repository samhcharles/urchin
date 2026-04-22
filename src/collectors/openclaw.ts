import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';
import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { Collector, EventKind, UrchinEvent } from '../types';

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// Extract raw agent name from sessionKey like "agent:maintenance:cron:JOB_ID:run:SESSION_ID"
function rawAgentFromSessionKey(sessionKey: string): string {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match?.[1] ?? 'openclaw';
}

function displayAgentName(agentName: string): string {
  if (agentName === 'main') return 'daily-brief';
  return agentName;
}

function kindForAgent(agentName: string): EventKind {
  if (agentName === 'maintenance' || agentName === 'brain-sync') return 'ops';
  if (agentName === 'main') return 'activity';
  return 'conversation';
}

export class OpenClawCollector implements Collector {
  name: 'openclaw' = 'openclaw';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    const [commandEvents, cronEvents] = await Promise.all([
      this.collectCommandLog(since),
      this.collectCronRuns(since),
    ]);
    return [...commandEvents, ...cronEvents];
  }

  private async collectCommandLog(since?: Date): Promise<UrchinEvent[]> {
    const logFile = this.config.openclawCommandsLog;
    if (!(await fs.pathExists(logFile))) return [];

    const rawData = await fs.readFile(logFile, 'utf-8');
    const lines = rawData.split('\n').filter((l) => l.trim().length > 0);
    const events: UrchinEvent[] = [];

    for (const [lineIndex, line] of lines.entries()) {
      try {
        // Real OpenClaw command logs are JSONL. Only text-bearing entries are high-signal.
        const entry = JSON.parse(line) as Record<string, unknown>;
        const text = toString(entry.text);
        if (!text) continue;

        const timestamp = toString(entry.timestamp);
        const ts = timestamp ? new Date(timestamp) : null;
        if (!ts || isNaN(ts.getTime())) continue;
        if (since && ts < since) continue;

        const action = toString(entry.action);
        const sessionKey = toString(entry.sessionKey);
        const senderId = toString(entry.senderId);
        const source = toString(entry.source);
        events.push({
          id: `openclaw-cmd-${ts.toISOString()}-${lineIndex}`,
          kind: 'conversation',
          source: 'openclaw',
          timestamp: ts.toISOString(),
          summary: sanitize(text, 140).split('\n')[0] ?? 'OpenClaw command',
          content: text,
          tags: ['openclaw', 'command'],
          metadata: {
            ...(action ? { action } : {}),
            ...(senderId ? { senderId } : {}),
            ...(sessionKey ? { sessionKey } : {}),
            ...(source ? { source } : {}),
          },
          provenance: {
            adapter: 'openclaw-commands-log',
            location: logFile,
            scope: 'local',
          },
        });
      } catch {
        // Fall back to legacy text format: [TIMESTAMP] user: MESSAGE
        const match = line.match(/^\[(.*?)] user: (.*)$/);
        if (match?.[1] && match?.[2]) {
          const ts = new Date(match[1]);
          if (isNaN(ts.getTime()) || (since && ts < since)) continue;
          events.push({
            id: `openclaw-cmd-${match[1]}-${lineIndex}`,
            kind: 'conversation',
            source: 'openclaw',
            timestamp: ts.toISOString(),
            summary: sanitize(match[2], 140).split('\n')[0] ?? 'OpenClaw event',
            content: match[2],
            tags: ['openclaw', 'command'],
            metadata: {},
            provenance: {
              adapter: 'openclaw-commands-log',
              location: logFile,
              scope: 'local',
            },
          });
        }
      }
    }

    return events;
  }

  private async collectCronRuns(since?: Date): Promise<UrchinEvent[]> {
    const runsDir = this.config.openclawCronRunsDir;
    if (!(await fs.pathExists(runsDir))) return [];

    const files = await glob('*.jsonl', { cwd: runsDir, absolute: true });
    const events: UrchinEvent[] = [];

    for (const file of files) {
      const jobId = path.basename(file, '.jsonl');
      const rawData = await fs.readFile(file, 'utf-8');
      const lines = rawData.split('\n').filter((l) => l.trim().length > 0);

      for (const [lineIndex, line] of lines.entries()) {
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;

          // Only capture finished runs that have a summary
          if (entry.action !== 'finished') continue;
          const summary = toString(entry.summary) ?? '';
          if (!summary) continue;

          const ts = typeof entry.ts === 'number' ? new Date(entry.ts) : null;
          if (!ts || isNaN(ts.getTime())) continue;
          if (since && ts < since) continue;

          const sessionKey = toString(entry.sessionKey) ?? '';
          const rawAgentName = rawAgentFromSessionKey(sessionKey);
          const agent = displayAgentName(rawAgentName);
          const kind = kindForAgent(rawAgentName);
          const status = toString(entry.status) ?? 'unknown';
          const model = toString(entry.model);
          const provider = toString(entry.provider);
          const deliveryStatus = toString(entry.deliveryStatus);
          const sessionId = toString(entry.sessionId);

          events.push({
            id: `openclaw-cron-${jobId}-${entry.ts}-${lineIndex}`,
            kind,
            source: 'openclaw',
            timestamp: ts.toISOString(),
            summary: sanitize(summary, 140).split('\n')[0] ?? `OpenClaw cron: ${agent}`,
            content: summary,
            tags: ['openclaw', 'cron', sanitize(agent, 60), sanitize(status, 40)],
            metadata: {
              jobId,
              agent,
              rawAgentName,
              status,
              sessionKey,
              ...(deliveryStatus ? { deliveryStatus } : {}),
              ...(model ? { model } : {}),
              ...(provider ? { provider } : {}),
              ...(typeof entry.durationMs === 'number' ? { durationMs: entry.durationMs } : {}),
            },
            provenance: {
              adapter: 'openclaw-cron-runs',
              location: file,
              scope: 'local',
              ...(sessionId ? { sessionId } : {}),
            },
          });
        } catch {
          // Skip malformed lines
        }
      }
    }

    return events;
  }
}
