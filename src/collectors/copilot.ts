import * as fs from 'fs-extra';
import * as path from 'node:path';
import { glob } from 'glob';

import { UrchinConfig } from '../core/config';
import { sanitize } from '../core/redaction';
import { AsyncAgentMetadata, Collector, UrchinEvent } from '../types';

interface BackgroundTaskStart {
  agentType?: string;
  description?: string;
  model?: string;
  name?: string;
  prompt?: string;
  toolCallId: string;
}

interface AgentLaunchContext {
  agentId: string;
  launch: BackgroundTaskStart;
}

interface ReadAgentStart {
  agentId: string;
  toolCallId: string;
}

function summarize(text: string): string {
  const trimmed = sanitize(text, 140);
  return trimmed.split('\n')[0] ?? trimmed;
}

function extractToolResultText(data: Record<string, unknown>): string {
  const result = data.result;
  if (result && typeof result === 'object') {
    const content = (result as Record<string, unknown>).content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }

    const detailedContent = (result as Record<string, unknown>).detailedContent;
    if (typeof detailedContent === 'string' && detailedContent.trim()) {
      return detailedContent;
    }
  }

  const error = data.error;
  return typeof error === 'string' ? error : '';
}

function parseAgentId(text: string): string | undefined {
  const match = text.match(/agent_id:\s*([A-Za-z0-9_-]+)/);
  return match?.[1];
}

function parseAgentStatus(text: string): AsyncAgentMetadata['status'] | undefined {
  if (/still running/i.test(text) || /status:\s*running/i.test(text)) {
    return 'running';
  }
  if (/Agent completed\./i.test(text) || /status:\s*completed/i.test(text)) {
    return 'completed';
  }
  if (/Agent failed\./i.test(text) || /status:\s*failed/i.test(text)) {
    return 'failed';
  }
  return undefined;
}

function eventTitle(context: AgentLaunchContext | undefined, fallback: string): string {
  return context?.launch.description ?? context?.launch.name ?? fallback;
}

export class CopilotCollector implements Collector {
  name: 'copilot' = 'copilot';

  constructor(private readonly config: UrchinConfig) {}

  async collect(since?: Date): Promise<UrchinEvent[]> {
    if (!(await fs.pathExists(this.config.copilotSessionRoot))) {
      return [];
    }

    const eventFiles = await glob('*/events.jsonl', {
      cwd: this.config.copilotSessionRoot,
      absolute: true,
    });

    const events: UrchinEvent[] = [];

    for (const eventFile of eventFiles) {
      const sessionId = path.basename(path.dirname(eventFile));
      const taskStarts = new Map<string, BackgroundTaskStart>();
      const agentsById = new Map<string, AgentLaunchContext>();
      const readAgentStarts = new Map<string, ReadAgentStart>();
      const raw = await fs.readFile(eventFile, 'utf8');
      for (const line of raw.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const timestamp = new Date(entry.timestamp);
          if (since && timestamp < since) {
            continue;
          }

          const type = entry.type;
          const data = entry.data ?? {};
          const content = typeof data.content === 'string' ? data.content : '';

          if (type === 'user.message' || type === 'assistant.message') {
            if (!content.trim()) {
              continue;
            }

            events.push({
              id: entry.id ?? `${sessionId}-${entry.timestamp}`,
              kind: 'conversation',
              source: 'copilot',
              timestamp: timestamp.toISOString(),
              summary: summarize(content),
              content,
              tags: ['copilot', 'session'],
              metadata: {
                interactionId: data.interactionId,
                role: type === 'user.message' ? 'user' : 'assistant',
              },
              provenance: {
                adapter: 'copilot-session-state',
                location: eventFile,
                scope: 'local',
                sessionId,
              },
            });
            continue;
          }

          if (type === 'tool.execution_start' && data.toolName === 'task' && data.arguments?.mode === 'background') {
            taskStarts.set(data.toolCallId, {
              agentType: typeof data.arguments.agent_type === 'string' ? data.arguments.agent_type : undefined,
              description: typeof data.arguments.description === 'string' ? data.arguments.description : undefined,
              model: typeof data.arguments.model === 'string' ? data.arguments.model : undefined,
              name: typeof data.arguments.name === 'string' ? data.arguments.name : undefined,
              prompt: typeof data.arguments.prompt === 'string' ? data.arguments.prompt : undefined,
              toolCallId: data.toolCallId,
            });
            continue;
          }

          if (type === 'tool.execution_complete' && typeof data.toolCallId === 'string' && taskStarts.has(data.toolCallId)) {
            const resultText = extractToolResultText(data);
            const agentId = parseAgentId(resultText);
            if (!agentId) {
              continue;
            }

            const launch = taskStarts.get(data.toolCallId);
            if (!launch) {
              continue;
            }

            agentsById.set(agentId, { agentId, launch });
            const title = eventTitle(agentsById.get(agentId), agentId);

            events.push({
              id: `${data.toolCallId}-launched`,
              kind: 'agent',
              source: 'copilot',
              timestamp: timestamp.toISOString(),
              summary: summarize(`Copilot agent launched — ${title}`),
              content: resultText,
              tags: ['copilot', 'agent', 'launched'],
              metadata: {
                agent: {
                  agentId,
                  agentType: launch.agentType,
                  model: launch.model,
                  parentToolCallId: launch.toolCallId,
                  status: 'launched',
                  title,
                } satisfies AsyncAgentMetadata,
                interactionId: data.interactionId,
                prompt: launch.prompt,
              },
              provenance: {
                adapter: 'copilot-session-state',
                location: eventFile,
                scope: 'local',
                sessionId,
              },
            });
            continue;
          }

          if (type === 'tool.execution_start' && data.toolName === 'read_agent' && typeof data.arguments?.agent_id === 'string') {
            readAgentStarts.set(data.toolCallId, {
              agentId: data.arguments.agent_id,
              toolCallId: data.toolCallId,
            });
            continue;
          }

          if (type === 'tool.execution_complete' && typeof data.toolCallId === 'string' && readAgentStarts.has(data.toolCallId)) {
            const readStart = readAgentStarts.get(data.toolCallId);
            if (!readStart) {
              continue;
            }

            const resultText = extractToolResultText(data);
            const status = parseAgentStatus(resultText);
            if (!status || status === 'running') {
              continue;
            }

            const context = agentsById.get(readStart.agentId);
            const title = eventTitle(context, readStart.agentId);

            events.push({
              id: `${data.toolCallId}-${status}`,
              kind: 'agent',
              source: 'copilot',
              timestamp: timestamp.toISOString(),
              summary: summarize(`Copilot agent ${status} — ${title}`),
              content: resultText,
              tags: ['copilot', 'agent', status],
              metadata: {
                agent: {
                  agentId: readStart.agentId,
                  agentType: context?.launch.agentType,
                  model: context?.launch.model,
                  parentToolCallId: context?.launch.toolCallId,
                  readToolCallId: readStart.toolCallId,
                  status,
                  title,
                } satisfies AsyncAgentMetadata,
                interactionId: data.interactionId,
                prompt: context?.launch.prompt,
              },
              provenance: {
                adapter: 'copilot-session-state',
                location: eventFile,
                scope: 'local',
                sessionId,
              },
            });
          }
        } catch {
          // Skip malformed lines.
        }
      }
    }

    return events;
  }
}
