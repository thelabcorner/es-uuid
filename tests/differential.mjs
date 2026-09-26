import assert from 'node:assert/strict';
import * as ours from '../dist/esuuid-core.esm.mjs';
import {
  NIL, MAX,
  parse, stringify, validate, version,
  v1, v3, v4, v5, v6, v7, v1ToV6, v6ToV1
} from 'uuid';
const DNS = v3.DNS;
const URL = v3.URL;

let checks = 0;
function same(a, b, label) {
  checks++;
  assert.equal(a, b, label);
}
function sameBytes(a, b, label) {
  checks++;
  assert.deepEqual(Array.from(a), Array.from(b), label);
}

same(ours.DNS, DNS, 'DNS');
same(ours.URL, URL, 'URL');
same(ours.NIL, NIL, 'NIL');
same(ours.MAX, MAX, 'MAX');

let state = 0x6d2b79f5;
function next() {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state;
}
function bytes16() {
  const a = new Array(16);
  for (let i = 0; i < 16; i++) a[i] = next() & 255;
  return a;
}

const namespaces = [DNS, URL];
const names = [
  '', 'www.example.com', 'hello', 'The quick brown fox',
  'Δοκιμή', '日本語', '😀 crystal UUID', 'café', 'A\u0000B'
];
for (const ns of namespaces) {
  for (const name of names) {
    same(ours.v3(name, ns), v3(name, ns), 'v3 ' + JSON.stringify(name));
    same(ours.v5(name, ns), v5(name, ns), 'v5 ' + JSON.stringify(name));
  }
}

for (let i = 0; i < 512; i++) {
  const random = bytes16();
  same(ours.create().v4({ random }), v4({ random }), 'v4 #' + i);

  const msecs = 946684800000 + (next() % 1000000000);
  const nsecs = next() % 20000;
  const clockseq = next() & 0x3fff;
  const node = bytes16().slice(0, 6);
  const opts = { random, msecs, nsecs, clockseq, node };
  same(ours.create().v1(opts), v1(opts), 'v1 #' + i);
  same(ours.create().v6(opts), v6(opts), 'v6 #' + i);

  const seq = next() >>> 0;
  same(ours.create().v7({ random, msecs, seq }), v7({ random, msecs, seq }), 'v7 #' + i);
}

for (let i = 0; i < 256; i++) {
  const u = v4({ random: bytes16() });
  same(ours.validate(u), validate(u), 'validate valid #' + i);
  same(ours.version(u), version(u), 'version #' + i);
  assert.deepEqual(ours.parse(u), Array.from(parse(u)), 'parse #' + i); checks++;
  same(ours.stringify(ours.parse(u)), stringify(parse(u)), 'stringify #' + i);
}

const conversionInputs = [
  '92f62d9e-22c4-11ef-97e9-325096b39f47',
  v1({ random: bytes16(), msecs: 1700000000000, nsecs: 9999, clockseq: 0x1234, node: [1,2,3,4,5,6] })
];
for (const u of conversionInputs) {
  same(ours.v1ToV6(u), v1ToV6(u), 'v1ToV6');
  same(ours.v6ToV1(ours.v1ToV6(u)), v6ToV1(v1ToV6(u)), 'v6ToV1');
}

// Hash padding boundaries. Namespace bytes contribute 16 bytes before the name,
// so 39/40 exercise the 55/56-byte MD5/SHA-1 padding transition as well.
const hashLengths = [0,1,15,16,31,32,39,40,54,55,56,57,63,64,65,119,120,121,127,128,129,255];
for (const length of hashLengths) {
  const text = 'x'.repeat(length);
  const raw = Array.from({length}, (_, i) => (i * 131 + 17) & 255);
  same(ours.v3(text, DNS), v3(text, DNS), 'v3 text padding length=' + length);
  same(ours.v5(text, DNS), v5(text, DNS), 'v5 text padding length=' + length);
  same(ours.v3(raw, URL), v3(raw, URL), 'v3 bytes padding length=' + length);
  same(ours.v5(raw, URL), v5(raw, URL), 'v5 bytes padding length=' + length);
}

for (const text of ['é', '晶', '😀', 'A😀晶éZ', '𐍈'.repeat(40)]) {
  same(ours.v3(text, DNS), v3(text, DNS), 'v3 unicode ' + JSON.stringify(text));
  same(ours.v5(text, DNS), v5(text, DNS), 'v5 unicode ' + JSON.stringify(text));
}

// Regressions fixed upstream in uuid 14.0.2.
const carryRandom = new Array(16).fill(0);
const carryOpts = { random: carryRandom, msecs: 1645557742000, nsecs: 10000, clockseq: 0x33c8, node: [1,2,3,4,5,6] };
same(ours.create().v1(carryOpts), v1(carryOpts), 'v1 nsecs carry');
same(ours.create().v6(carryOpts), v6(carryOpts), 'v6 nsecs carry');
const generatedNodeOpts = { random: [0,0,0,0,0,0,0,0,0x12,0x34,0x20,2,3,4,5,6], msecs: 1700000000000, nsecs: 0 };
same(ours.create().v1(generatedNodeOpts), v1(generatedNodeOpts), 'v1 generated multicast node');
const defaultSeqOpts = { random: bytes16(), msecs: 1700000000000 };
same(ours.create().v7(defaultSeqOpts), v7(defaultSeqOpts), 'v7 default sequence derivation');
const maxSeqOpts = { random: bytes16(), msecs: 1700000000000, seq: 0xffffffff };
same(ours.create().v7(maxSeqOpts), v7(maxSeqOpts), 'v7 unsigned max sequence');

// Offset writes must exactly match uuid, including preserving surrounding bytes.
const offsetRandom = bytes16();
const oursV1Buf = new Array(24).fill(0xaa), refV1Buf = new Array(24).fill(0xaa);
const offsetV1Opts = {random: offsetRandom, msecs:1700000000000, nsecs:9999, clockseq:0x1234, node:[1,2,3,4,5,6]};
ours.create().v1(offsetV1Opts, oursV1Buf, 4); v1(offsetV1Opts, refV1Buf, 4); sameBytes(oursV1Buf, refV1Buf, 'v1 offset buffer');
const oursV4Buf = new Array(24).fill(0xaa), refV4Buf = new Array(24).fill(0xaa);
ours.create().v4({random:offsetRandom}, oursV4Buf, 4); v4({random:offsetRandom}, refV4Buf, 4); sameBytes(oursV4Buf, refV4Buf, 'v4 offset buffer');
const oursV6Buf = new Array(24).fill(0xaa), refV6Buf = new Array(24).fill(0xaa);
ours.create().v6(offsetV1Opts, oursV6Buf, 4); v6(offsetV1Opts, refV6Buf, 4); sameBytes(oursV6Buf, refV6Buf, 'v6 offset buffer');
const oursV7Buf = new Array(24).fill(0xaa), refV7Buf = new Array(24).fill(0xaa);
const offsetV7Opts = {random:offsetRandom, msecs:1700000000000, seq:0x89abcdef};
ours.create().v7(offsetV7Opts, oursV7Buf, 4); v7(offsetV7Opts, refV7Buf, 4); sameBytes(oursV7Buf, refV7Buf, 'v7 offset buffer');
const oursV3Buf = new Array(24).fill(0xaa), refV3Buf = new Array(24).fill(0xaa);
ours.v3('offset', DNS, oursV3Buf, 4); v3('offset', DNS, refV3Buf, 4); sameBytes(oursV3Buf, refV3Buf, 'v3 offset buffer');
const oursV5Buf = new Array(24).fill(0xaa), refV5Buf = new Array(24).fill(0xaa);
ours.v5('offset', DNS, oursV5Buf, 4); v5('offset', DNS, refV5Buf, 4); sameBytes(oursV5Buf, refV5Buf, 'v5 offset buffer');

console.log('[differential] ' + checks + ' uuid@14.0.2 parity checks passed');
