import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'fs-extra';
import * as os from 'node:os';
import * as path from 'node:path';
import { readCachedEvents } from '../src/mcp/reader';
import { UrchinEvent } from '../src/types';

function makeEvent(overrides: Partial<UrchinEvent> & Pick<UrchinEvent, 'id' | 'timestamp'>): UrchinEvent {
  return {
    kind: 'conversation',
    source: 'claude',
    summary: 'test summary',
    content: 'test content',
    tags: [],
    metadata: {},
    provenance: { adapter: 'test', location: '/tmp/test', scope: 'local' },
    ...overrides,
  };
}

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'urchin-reader-'));
  try {
    await fn(dir);
  } finally {
    await fs.remove(dir);
  }
}

test('returns empty array for missing cache file', async () => {
  const result = await readCachedEvents('/tmp/nonexistent-urchin-cache.jsonl');
  assert.deepEqual(result, []);
});

test('reads and filters events by since date', async () => {
  await withTempDir(async (dir) => {
    const cachePath = path.join(dir, 'events.jsonl');
    const old = makeEvent({ id: 'old', timestamp: '2026-01-01T00:00:00.000Z' });
    const recent = makeEvent({ id: 'recent', timestamp: '2026-04-22T00:00:00.000Z' });
    await fs.writeFile(cachePath, `${JSON.stringify(old)}\n${JSON.stringify(recent)}\n`, 'utf8');

    const result = await readCachedEvents(cachePath, { since: new Date('2026-04-01T00:00:00.000Z') });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'recent');
  });
});

test('filters events by source', async () => {
  await withTempDir(async (dir) => {
    const cachePath = path.join(dir, 'events.jsonl');
    const claude = makeEvent({ id: 'claude-evt', timestamp: '2026-04-22T00:00:00.000Z', source: 'claude' });
    const git = makeEvent({ id: 'git-evt', timestamp: '2026-04-22T01:00:00.000Z', source: 'git' });
    await fs.writeFile(cachePath, `${JSON.stringify(claude)}\n${JSON.stringify(git)}\n`, 'utf8');

    const result = await readCachedEvents(cachePath, { source: 'git' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'git-evt');
  });
});

test('respects limit and returns newest first', async () => {
  await withTempDir(async (dir) => {
    const cachePath = path.join(dir, 'events.jsonl');
    const events = ['2026-04-20', '2026-04-21', '2026-04-22'].map((day, i) =>
      makeEvent({ id: `e${i}`, timestamp: `${day}T00:00:00.000Z` }),
    );
    await fs.writeFile(cachePath, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');

    const result = await readCachedEvents(cachePath, { limit: 2 });
    assert.equal(result.length, 2);
    assert.equal(result[0]?.id, 'e2'); // newest first
    assert.equal(result[1]?.id, 'e1');
  });
});

test('skips malformed lines', async () => {
  await withTempDir(async (dir) => {
    const cachePath = path.join(dir, 'events.jsonl');
    const good = makeEvent({ id: 'good', timestamp: '2026-04-22T00:00:00.000Z' });
    await fs.writeFile(cachePath, `${JSON.stringify(good)}\nnot json at all\n{}\n`, 'utf8');

    const result = await readCachedEvents(cachePath);
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, 'good');
  });
});
