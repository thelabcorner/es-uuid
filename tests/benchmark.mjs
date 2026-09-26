import { performance } from 'node:perf_hooks';
import * as U from '../dist/esuuid-core.esm.mjs';

function bench(name, iterations, fn) {
  for (let i = 0; i < 2000; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - t0;
  console.log(name + ': ' + (iterations / (elapsed / 1000)).toFixed(0) + ' ops/s (' + elapsed.toFixed(2) + ' ms)');
}

const zero = new Array(16).fill(0);
const g = U.create({ rng: () => zero, now: () => 1700000000000 });
bench('v4', 100000, () => g.v4({ random: zero }));
bench('v7', 100000, () => g.v7({ random: zero, msecs: 1700000000000, seq: 0x12345678 }));
bench('parse', 100000, () => U.parse('919108f7-52d1-4320-9bac-f847db4148a8'));
bench('stringify', 100000, () => U.stringify([0x91,0x91,0x08,0xf7,0x52,0xd1,0x43,0x20,0x9b,0xac,0xf8,0x47,0xdb,0x41,0x48,0xa8]));
bench('v5', 20000, () => U.v5('www.example.com', U.DNS));
