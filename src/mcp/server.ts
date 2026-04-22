import { randomUUID } from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { UrchinConfig } from '../core/config';
import { EventSource } from '../types';
import { readCachedEvents } from './reader';

const KNOWN_SOURCES: EventSource[] = [
  'agent', 'browser', 'claude', 'copilot', 'gemini', 'git', 'manual', 'openclaw', 'shell', 'vscode',
];

const TOOL_DEFINITIONS = [
  {
    name: 'urchin_ingest',
    description:
      'Record an activity event into Urchin from any AI tool — Copilot, Gemini, Codex, Claude, Continue.dev, Cursor, or any MCP-capable client. Call this at the end of a session to capture what was worked on. The event is picked up by the next urchin sync.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'What was done — a description or summary of the session',
        },
        workspace: {
          type: 'string',
          description: 'Absolute path to the workspace or repo (e.g. /home/samhc/dev/urchin)',
        },
        source: {
          type: 'string',
          description: 'Which AI tool is reporting: copilot, gemini, vscode, claude, agent, browser, shell (default: vscode)',
        },
        session: {
          type: 'string',
          description: 'Session identifier (optional — derived from workspace + date if omitted)',
        },
        title: {
          type: 'string',
          description: 'Chat or task title (optional)',
        },
        file: {
          type: 'string',
          description: 'Primary file being edited (optional)',
        },
        kind: {
          type: 'string',
          description: 'Event kind: "conversation" (default) or "agent"',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional tags (optional)',
        },
      },
      required: ['content', 'workspace'],
    },
  },
  {
    name: 'urchin_recent_activity',
    description:
      'Returns recent activity events collected by Urchin from local AI tools and workflow sources (Claude, OpenClaw, git, shell, VS Code, Gemini, Copilot, etc.). Use this to understand what was worked on recently.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hours: {
          type: 'number',
          description: 'How many hours back to look (default: 24)',
        },
        source: {
          type: 'string',
          description: 'Filter by source: claude, openclaw, git, shell, vscode, gemini, copilot, agent, browser',
        },
        limit: {
          type: 'number',
          description: 'Maximum events to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'urchin_project_context',
    description:
      'Returns events related to a specific project, matched by project name in tags, summary, or content. Useful for getting context on a codebase or task before working on it.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        project: {
          type: 'string',
          description: 'Project name or path fragment (e.g. "urchin", "openclaw", "snek")',
        },
        hours: {
          type: 'number',
          description: 'How many hours back to look (default: 168, i.e. 7 days)',
        },
        limit: {
          type: 'number',
          description: 'Maximum events to return (default: 30)',
        },
      },
      required: ['project'],
    },
  },
  {
    name: 'urchin_search',
    description:
      'Full-text search over recent Urchin events. Searches summary and content fields. Useful for finding when a topic was discussed or worked on.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query (case-insensitive substring match)',
        },
        hours: {
          type: 'number',
          description: 'How many hours back to search (default: 168, i.e. 7 days)',
        },
        limit: {
          type: 'number',
          description: 'Maximum events to return (default: 20)',
        },
      },
      required: ['query'],
    },
  },
];

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function formatEvents(events: Awaited<ReturnType<typeof readCachedEvents>>): string {
  if (events.length === 0) return 'No events found.';
  return JSON.stringify(
    events.map((e) => ({
      timestamp: e.timestamp,
      source: e.source,
      kind: e.kind,
      summary: e.summary,
      tags: e.tags,
    })),
    null,
    2,
  );
}

export async function startMcpServer(config: UrchinConfig): Promise<void> {
  const server = new Server(
    { name: 'urchin', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const params = (args ?? {}) as Record<string, unknown>;

    if (name === 'urchin_ingest') {
      const content = typeof params.content === 'string' ? params.content.trim() : '';
      const workspace = typeof params.workspace === 'string' ? params.workspace.trim() : '';
      if (!content || !workspace) {
        return { content: [{ type: 'text', text: 'content and workspace are required.' }], isError: true };
      }

      const source = typeof params.source === 'string' && KNOWN_SOURCES.includes(params.source as EventSource)
        ? (params.source as EventSource)
        : 'vscode';
      const workspaceBase = path.basename(workspace);
      const today = new Date().toISOString().slice(0, 10);
      const sessionId = typeof params.session === 'string' && params.session.trim()
        ? params.session.trim()
        : `${workspaceBase.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase()}-${today}`;

      const title = typeof params.title === 'string' && params.title.trim() ? params.title.trim() : undefined;
      const extraTags = Array.isArray(params.tags) ? params.tags.filter((t): t is string => typeof t === 'string') : [];

      const event = {
        id: randomUUID(),
        source,
        kind: params.kind === 'agent' ? 'agent' : 'conversation',
        content,
        summary: title ? `${source} — ${title}` : content.slice(0, 140),
        timestamp: new Date().toISOString(),
        tags: [source, 'mcp-ingest', ...extraTags],
        metadata: {
          workspacePath: workspace,
          ...(typeof params.file === 'string' && params.file.trim() ? { filePath: params.file.trim() } : {}),
          ...(title ? { title } : {}),
        },
        sessionId,
        scope: 'local',
      };

      const intakeFile = path.join(config.intakeRoot, `${source}.jsonl`);
      await fs.ensureDir(config.intakeRoot);
      await fs.appendFile(intakeFile, `${JSON.stringify(event)}\n`, 'utf8');

      return {
        content: [{ type: 'text', text: `Recorded [${source}]: ${event.summary.slice(0, 80)}` }],
      };
    }

    if (name === 'urchin_recent_activity') {
      const hours = typeof params.hours === 'number' ? params.hours : 24;
      const limit = typeof params.limit === 'number' ? params.limit : 20;
      const source = typeof params.source === 'string' && KNOWN_SOURCES.includes(params.source as EventSource)
        ? (params.source as EventSource)
        : undefined;

      const events = await readCachedEvents(config.eventCachePath, {
        since: hoursAgo(hours),
        source,
        limit,
      });

      return {
        content: [{ type: 'text', text: formatEvents(events) }],
      };
    }

    if (name === 'urchin_project_context') {
      const project = typeof params.project === 'string' ? params.project.toLowerCase().trim() : '';
      if (!project) {
        return { content: [{ type: 'text', text: 'project parameter is required.' }], isError: true };
      }
      const hours = typeof params.hours === 'number' ? params.hours : 168;
      const limit = typeof params.limit === 'number' ? params.limit : 30;

      const all = await readCachedEvents(config.eventCachePath, { since: hoursAgo(hours) });
      const matched = all.filter((e) => {
        const inTags = e.tags.some((t) => t.toLowerCase().includes(project));
        const inSummary = e.summary.toLowerCase().includes(project);
        const inContent = e.content.toLowerCase().includes(project);
        return inTags || inSummary || inContent;
      }).slice(0, limit);

      return {
        content: [{ type: 'text', text: formatEvents(matched) }],
      };
    }

    if (name === 'urchin_search') {
      const query = typeof params.query === 'string' ? params.query.toLowerCase().trim() : '';
      if (!query) {
        return { content: [{ type: 'text', text: 'query parameter is required.' }], isError: true };
      }
      const hours = typeof params.hours === 'number' ? params.hours : 168;
      const limit = typeof params.limit === 'number' ? params.limit : 20;

      const all = await readCachedEvents(config.eventCachePath, { since: hoursAgo(hours) });
      const matched = all.filter((e) =>
        e.summary.toLowerCase().includes(query) || e.content.toLowerCase().includes(query),
      ).slice(0, limit);

      return {
        content: [{ type: 'text', text: formatEvents(matched) }],
      };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
