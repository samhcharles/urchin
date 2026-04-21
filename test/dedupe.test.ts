import assert from 'node:assert/strict';
import test from 'node:test';

import { dedupeEvents } from '../src/core/dedupe';
import { UrchinEvent } from '../src/types';

function event(overrides: Partial<UrchinEvent> = {}): UrchinEvent {
  return {
    id: 'event-1',
    kind: 'conversation',
    source: 'copilot',
    timestamp: '2026-04-21T08:00:15.000Z',
    summary: 'Reviewing Urchin output',
    content: 'Reviewing Urchin output in the Obsidian brain.',
    tags: [],
    metadata: {},
    provenance: {
      adapter: 'test',
      location: '/tmp/events.jsonl',
      scope: 'local',
    },
    ...overrides,
  };
}

test('dedupeEvents collapses near-identical events in the same minute bucket', () => {
  const first = event();
  const second = event({
    id: 'event-2',
    timestamp: '2026-04-21T08:00:49.000Z',
    summary: ' Reviewing   Urchin output ',
    content: 'Reviewing   Urchin output in the Obsidian brain.',
  });

  const deduped = dedupeEvents([first, second]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.id, 'event-1');
});

test('dedupeEvents keeps distinct events when the summary or minute differs', () => {
  const first = event();
  const second = event({
    id: 'event-2',
    timestamp: '2026-04-21T08:01:15.000Z',
  });
  const third = event({
    id: 'event-3',
    summary: 'Syncing project activity',
  });

  const deduped = dedupeEvents([first, second, third]);
  assert.equal(deduped.length, 3);
});
