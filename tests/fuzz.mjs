import assert from 'node:assert/strict';
import * as U from '../dist/esuuid-core.esm.mjs';

let state = 0x12345678;
function next() {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return state >>> 0;
}
function random16() {
  const out = new Array(16);
  for (let i = 0; i < 16; i++) out[i] = next() & 255;
  return out;
}

let checks = 0;
for (let i = 0; i < 10000; i++) {
  const random = random16();
  const v4 = U.create().v4({ random });
  assert.equal(U.stringify(U.parse(v4)), v4); checks++;
  assert.equal(U.version(v4), 4); checks++;
  assert.ok(U.validate(v4)); checks++;

  const msecs = next() * 1000 + (next() % 1000);
  const bounded = msecs % 281474976710656;
  const seq = next();
  const v7 = U.create().v7({ random, msecs: bounded, seq });
  assert.equal(U.stringify(U.parse(v7)), v7); checks++;
  assert.equal(U.version(v7), 7); checks++;
  assert.ok(U.validate(v7)); checks++;
}

for (let i = 0; i < 5000; i++) {
  const random = random16();
  const opts = {
    random,
    msecs: 946684800000 + (next() % 1500000000),
    nsecs: next() % 30000,
    clockseq: next() & 0x3fff,
    node: random16().slice(0, 6)
  };
  const g = U.create();
  const one = g.v1(opts);
  const six = U.v1ToV6(one);
  assert.equal(U.v6ToV1(six), one); checks++;
  assert.equal(U.version(one), 1); checks++;
  assert.equal(U.version(six), 6); checks++;
}

console.log('[fuzz] ' + checks + ' invariant checks passed');
