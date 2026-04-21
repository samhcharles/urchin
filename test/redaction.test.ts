import test from 'node:test';
import assert from 'node:assert/strict';

import { redact } from '../src/core/redaction';

test('redact removes common token patterns', () => {
  const input = 'COOLIFY_ACCESS_TOKEN="1|droHUJyOik63axLZrcxFaxnujluZch33Pl8Ugd4vf1093daa" gho_abcdefghijklmnopqrstuvwxyz';
  const output = redact(input);

  assert.equal(output.includes('droHUJyOik63axLZrcxFaxnujluZch33Pl8Ugd4vf1093daa'), false);
  assert.equal(output.includes('gho_abcdefghijklmnopqrstuvwxyz'), false);
  assert.match(output, /\[REDACTED/);
});
