import * as http from 'node:http';
import * as net from 'node:net';
import { randomUUID } from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { UrchinConfig } from '../core/config';
import { EventKind, EventSource } from '../types';

const KNOWN_SOURCES: EventSource[] = [
  'agent', 'browser', 'claude', 'copilot', 'gemini', 'git', 'manual', 'openclaw', 'shell', 'vscode',
];
const KNOWN_KINDS: EventKind[] = ['activity', 'agent', 'capture', 'code', 'conversation', 'ops'];

function toSource(v: unknown): EventSource {
  return typeof v === 'string' && KNOWN_SOURCES.includes(v as EventSource) ? (v as EventSource) : 'manual';
}

function toKind(v: unknown): EventKind {
  return typeof v === 'string' && KNOWN_KINDS.includes(v as EventKind) ? (v as EventKind) : 'capture';
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

/** Try to bind to a port. Returns the port on success, throws if all candidates are busy. */
async function findFreePort(preferred: number, maxTries = 5): Promise<number> {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const candidate = preferred + attempt;
    const free = await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(candidate, '127.0.0.1');
    });
    if (free) return candidate;
  }
  throw new Error(
    `urchin: could not bind intake server — ports ${preferred}–${preferred + maxTries - 1} all in use. ` +
    `Set URCHIN_INTAKE_PORT to a free port.`,
  );
}

export async function startIntakeServer(config: UrchinConfig): Promise<{ server: http.Server; port: number }> {
  const port = await findFreePort(config.intakePort);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { status: 'ok', service: 'urchin-intake', port });
    }

    if (req.method === 'POST' && req.url === '/ingest') {
      let body: Record<string, unknown>;
      try {
        const raw = await readBody(req);
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return json(res, 400, { error: 'invalid JSON body' });
      }

      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content) {
        return json(res, 400, { error: 'content is required' });
      }

      const source = toSource(body.source);
      const kind = toKind(body.kind);
      const summary = typeof body.summary === 'string' && body.summary.trim()
        ? body.summary.trim()
        : content.slice(0, 140);
      const tags = Array.isArray(body.tags)
        ? body.tags.filter((t): t is string => typeof t === 'string')
        : [source, 'http-intake'];
      const metadata = typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata as Record<string, unknown>
        : {};

      const event = {
        id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID(),
        source,
        kind,
        content,
        summary,
        timestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString(),
        tags,
        metadata,
        sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
        scope: body.scope === 'network' ? 'network' : 'local',
      };

      const intakeFile = path.join(config.intakeRoot, `${source}.jsonl`);
      await fs.ensureDir(config.intakeRoot);
      await fs.appendFile(intakeFile, `${JSON.stringify(event)}\n`, 'utf8');

      return json(res, 200, { ok: true, id: event.id, source, summary: event.summary.slice(0, 80) });
    }

    return json(res, 404, { error: 'not found' });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));

  // Record live port so any tool can discover it without hardcoding
  await fs.ensureDir(path.dirname(config.intakePortFile));
  await fs.writeFile(config.intakePortFile, String(port), 'utf8');

  return { server, port };
}
