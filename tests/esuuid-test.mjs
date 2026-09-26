import assert from 'node:assert/strict';
import {
  NIL, MAX, DNS, URL, OID, X500,
  parse, stringify, validate, version,
  v3, v5, v1ToV6, v6ToV1, create
} from '../dist/esuuid-core.esm.mjs';

let checks = 0;
function eq(actual, expected, label) {
  checks++;
  assert.equal(actual, expected, label);
}
function ok(value, label) {
  checks++;
  assert.ok(value, label);
}
function throws(fn, ctor, label) {
  checks++;
  assert.throws(fn, ctor, label);
}
function zeros() {
  return new Array(16).fill(0);
}

// RFC 9562 Appendix A.
const g = create({ rng: () => new Array(16).fill(0) });
eq(
  g.v1({ msecs: 1645557742000, nsecs: 0, clockseq: 0x33c8, node: [0x9f,0x6b,0xde,0xce,0xd8,0x46], random: new Array(16).fill(0) }),
  'c232ab00-9414-11ec-b3c8-9f6bdeced846',
  'RFC v1 vector'
);
eq(v3('www.example.com', DNS), '5df41881-3aed-3515-88a7-2f4a814cf09e', 'RFC v3 vector');
eq(
  g.v4({ random: [0x91,0x91,0x08,0xf7,0x52,0xd1,0x33,0x20,0x5b,0xac,0xf8,0x47,0xdb,0x41,0x48,0xa8] }),
  '919108f7-52d1-4320-9bac-f847db4148a8',
  'RFC v4 vector'
);
eq(v5('www.example.com', DNS), '2ed6657d-e927-568b-95e1-2665a8aea6a2', 'RFC v5 vector');
eq(
  g.v6({ msecs: 1645557742000, nsecs: 0, clockseq: 0x33c8, node: [0x9f,0x6b,0xde,0xce,0xd8,0x46], random: new Array(16).fill(0) }),
  '1ec9414c-232a-6b00-b3c8-9f6bdeced846',
  'RFC v6 vector'
);
const v7Random = new Array(16).fill(0);
v7Random[10] = 0xdc; v7Random[11] = 0x0c; v7Random[12] = 0x0c;
v7Random[13] = 0x07; v7Random[14] = 0x39; v7Random[15] = 0x8f;
eq(
  g.v7({ msecs: 1645557742000, seq: 0xcc363137, random: v7Random }),
  '017f22e2-79b0-7cc3-98c4-dc0c0c07398f',
  'RFC v7 vector'
);

eq(NIL, '00000000-0000-0000-0000-000000000000', 'NIL');
eq(MAX, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'MAX');
eq(OID, '6ba7b812-9dad-11d1-80b4-00c04fd430c8', 'OID');
eq(X500, '6ba7b814-9dad-11d1-80b4-00c04fd430c8', 'X500');
ok(validate(NIL), 'NIL validates');
ok(validate(MAX), 'MAX validates');
eq(version(NIL), 0, 'NIL version nibble');
eq(version(MAX), 15, 'MAX version nibble');
ok(!validate('ffffffff-ffff-0fff-8fff-ffffffffffff'), 'non NIL/MAX v0 rejected');
ok(!validate('00000000-0000-9000-8000-000000000000'), 'v9 rejected');
ok(!validate('00000000-0000-4000-7000-000000000000'), 'non-RFC variant rejected');
ok(validate('00000000-0000-8000-8000-000000000000'), 'v8 accepted');
eq(version('00000000-0000-8000-8000-000000000000'), 8, 'v8 recognized');

const p = parse('00112233-4455-6677-8899-aabbccddeeff');
assert.deepEqual(p, [0x00,0x11,0x22,0x33,0x44,0x55,0x66,0x77,0x88,0x99,0xaa,0xbb,0xcc,0xdd,0xee,0xff]);
checks++;
eq(stringify(p), '00112233-4455-6677-8899-aabbccddeeff', 'parse/stringify round trip');

const v1Known = '92f62d9e-22c4-11ef-97e9-325096b39f47';
const v6Known = '1ef22c49-2f62-6d9e-97e9-325096b39f47';
eq(v1ToV6(v1Known), v6Known, 'v1ToV6 known');
eq(v6ToV1(v6Known), v1Known, 'v6ToV1 known');

eq(v3('www.example.com', v3.DNS ?? DNS), '5df41881-3aed-3515-88a7-2f4a814cf09e', 'v3 stateless');
eq(v5('www.example.com', v5.DNS ?? DNS), '2ed6657d-e927-568b-95e1-2665a8aea6a2', 'v5 stateless');

const buffer = new Array(20).fill(0xaa);
const ret = g.v4({ random: new Array(16).fill(0) }, buffer, 2);
ok(ret === buffer, 'buffer identity');
eq(buffer[2 + 6], 0x40, 'buffer version byte');
eq(buffer[2 + 8], 0x80, 'buffer variant byte');
throws(() => g.v4({ random: new Array(16).fill(0) }, new Array(15), 0), RangeError, 'short buffer rejected');
throws(() => g.v4({ random: new Array(16).fill(0) }, new Array(16), -1), RangeError, 'negative offset rejected');
throws(() => create().v4(), Error, 'core stays injection-only; host facade owns entropy fallback policy');

// Monotonic v7 for equal and backwards wall clock.
let now = 1700000000000;
let word = 0;
const monotonic = create({
  now: () => now,
  rng: () => {
    const a = new Array(16).fill(0);
    a[6] = (word >>> 24) & 0xff;
    a[7] = (word >>> 16) & 0xff;
    a[8] = (word >>> 8) & 0xff;
    a[9] = word & 0xff;
    word++;
    return a;
  }
});
const a = monotonic.v7();
const b = monotonic.v7();
now--;
const c = monotonic.v7();
ok(a < b && b < c, 'v7 remains lexicographically monotonic for same/backwards time');

// UTF-8 hashing: BMP and astral Unicode must work; malformed UTF-16 is rejected.
ok(validate(v5('Δ/😀/晶', URL)), 'UTF-8 Unicode name hashing');
throws(() => v5('\ud800', URL), URIError, 'lone surrogate rejected');

// Entropy consumers intentionally read exactly the first 16 bytes. This matches
// uuid and avoids wasting time validating/copying a larger ESRAND/user buffer.
const longRandom = new Array(20).fill(0);
longRandom[16] = 999; // irrelevant tail must never be observed
longRandom[17] = -1;
eq(g.v4({ random: longRandom }), '00000000-0000-4000-8000-000000000000', 'entropy ignores bytes after prefix 16');
eq(create({ rng: () => longRandom }).v4(), '00000000-0000-4000-8000-000000000000', 'RNG entropy ignores bytes after prefix 16');
throws(() => create({ rng: () => new Array(15).fill(0) }).v4(), TypeError, 'short RNG rejected');

const offsetCases = [
  ['v1', () => g.v1({msecs:1645557742000,nsecs:0,clockseq:0x33c8,node:[0x9f,0x6b,0xde,0xce,0xd8,0x46],random:zeros()}, new Array(18).fill(0xaa), 2)],
  ['v3', () => v3('www.example.com', DNS, new Array(18).fill(0xaa), 2)],
  ['v5', () => v5('www.example.com', DNS, new Array(18).fill(0xaa), 2)],
  ['v6', () => g.v6({msecs:1645557742000,nsecs:0,clockseq:0x33c8,node:[0x9f,0x6b,0xde,0xce,0xd8,0x46],random:zeros()}, new Array(18).fill(0xaa), 2)],
  ['v7', () => g.v7({msecs:1645557742000,seq:0xcc363137,random:v7Random}, new Array(18).fill(0xaa), 2)]
];
for (const [label, fn] of offsetCases) {
  const out = fn();
  eq(out.length, 18, label + ' offset output length');
  eq(out[0], 0xaa, label + ' preserves prefix');
  eq(out[1], 0xaa, label + ' preserves prefix 2');
}

const defaultV1 = create({rng: () => new Array(16).fill(0), now: () => 1700000000000}).v1();
ok((parse(defaultV1)[10] & 1) === 1, 'generated v1 node sets multicast bit');
ok(validate(g.v1({msecs:1645557742000,nsecs:10000,clockseq:0x33c8,node:[1,2,3,4,5,6],random:zeros()})), 'v1 nsecs carry remains valid');
ok(validate(g.v7({msecs:1645557742000,seq:0xffffffff,random:zeros()})), 'v7 accepts full unsigned seq range');

console.log('[esuuid-test] ' + checks + ' checks passed');
