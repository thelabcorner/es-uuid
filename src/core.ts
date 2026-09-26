import {
  ByteArrayLike, FactoryOptions, RandomBytesFn, RandomOptions,
  UUIDGenerator, V1Options, V7Options
} from './types';

export var VERSION = '0.1.0';
export var NIL = '00000000-0000-0000-0000-000000000000';
export var MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
export var DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export var URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
export var OID = '6ba7b812-9dad-11d1-80b4-00c04fd430c8';
export var X500 = '6ba7b814-9dad-11d1-80b4-00c04fd430c8';

var TWO32 = 4294967296;
var MAX_V7_MSECS = 281474976710655;
var GREGORIAN_OFFSET_MS = 12219292800000;

var BYTE_TO_HEX: string[] = [];
(function initHex(): void {
  var i: number;
  for (i = 0; i < 256; i++) BYTE_TO_HEX[i] = (i + 256).toString(16).substr(1);
})();

function isInteger(value: number): boolean {
  return value === value && (value - value) === 0 && Math.floor(value) === value;
}

// ExtendScript's bitwise operator precedence differs from ECMA-262 and common
// minifiers may remove parentheses using standard JavaScript precedence rules.
// Keep compound bitwise composition behind single-operator helpers.
function bor32(a: number, b: number): number {
  return a | b;
}

function toInt32(value: number): number {
  return value | 0;
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

function assertByte(value: number, label: string): number {
  if (!isInteger(value) || value < 0 || value > 255) throw new TypeError(label + ' must contain byte values 0..255');
  return value;
}

function cloneBytes(value: ByteArrayLike, minimum: number, label: string): number[] {
  if (value === null || value === undefined || typeof value.length !== 'number' || value.length < minimum) {
    throw new TypeError(label + ' must contain at least ' + minimum + ' bytes');
  }
  var out: number[] = [];
  var i: number;
  for (i = 0; i < value.length; i++) out[i] = assertByte(value[i], label);
  return out;
}

function clonePrefixBytes(value: ByteArrayLike, count: number, label: string): number[] {
  if (value === null || value === undefined || typeof value.length !== 'number' || value.length < count) {
    throw new TypeError(label + ' must contain at least ' + count + ' bytes');
  }
  var out: number[] = [];
  var i: number;
  for (i = 0; i < count; i++) out[i] = assertByte(value[i], label);
  return out;
}

function assertOutput(buffer: number[] | undefined, offset: number | undefined): number {
  var off = offset === undefined ? 0 : offset;
  if (!isInteger(off) || off < 0) throw new RangeError('UUID output offset must be a non-negative integer');
  if (buffer !== undefined && off + 16 > buffer.length) {
    throw new RangeError('UUID byte range ' + off + ':' + (off + 15) + ' is out of buffer bounds');
  }
  return off;
}

function unsafeStringify(arr: ByteArrayLike, offset?: number): string {
  var i = offset === undefined ? 0 : offset;
  return BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + '-' +
    BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + '-' +
    BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + '-' +
    BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + '-' +
    BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] +
    BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]] + BYTE_TO_HEX[arr[i++]];
}

export function validate(uuid: string): boolean {
  if (typeof uuid !== 'string' || uuid.length !== 36) return false;
  if (uuid.charAt(8) !== '-' || uuid.charAt(13) !== '-' || uuid.charAt(18) !== '-' || uuid.charAt(23) !== '-') return false;
  var i: number;
  var code: number;
  for (i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) continue;
    code = uuid.charCodeAt(i);
    if (hexNibble(code) < 0) return false;
  }
  var lower = uuid.toLowerCase();
  if (lower === NIL || lower === MAX) return true;
  var ver = hexNibble(uuid.charCodeAt(14));
  if (ver < 1 || ver > 8) return false;
  var variant = hexNibble(uuid.charCodeAt(19));
  return variant >= 8 && variant <= 11;
}

export function version(uuid: string): number {
  if (!validate(uuid)) throw new TypeError('Invalid UUID');
  return hexNibble(uuid.charCodeAt(14));
}

export function parse(uuid: string): number[] {
  if (!validate(uuid)) throw new TypeError('Invalid UUID');
  var out: number[] = [];
  var oi = 0;
  var i = 0;
  while (i < 36) {
    if (uuid.charAt(i) === '-') { i++; continue; }
    out[oi++] = (hexNibble(uuid.charCodeAt(i)) << 4) + hexNibble(uuid.charCodeAt(i + 1));
    i += 2;
  }
  return out;
}

export function stringify(arr: ByteArrayLike, offset?: number): string {
  var off = offset === undefined ? 0 : offset;
  if (!isInteger(off) || off < 0 || arr === null || arr === undefined || typeof arr.length !== 'number' || off + 16 > arr.length) {
    throw new TypeError('Invalid UUID byte array');
  }
  var i: number;
  for (i = 0; i < 16; i++) assertByte(arr[off + i], 'UUID byte array');
  var uuid = unsafeStringify(arr, off);
  if (!validate(uuid)) throw new TypeError('Stringified UUID is invalid');
  return uuid;
}

function emit(bytes: number[], buffer?: number[], offset?: number): string | number[] {
  if (buffer === undefined) return unsafeStringify(bytes, 0);
  var off = assertOutput(buffer, offset);
  var i: number;
  for (i = 0; i < 16; i++) buffer[off + i] = bytes[i];
  return buffer;
}

function utf8Bytes(value: string): number[] {
  var out: number[] = [];
  var i = 0;
  var c: number;
  var d: number;
  var cp: number;
  while (i < value.length) {
    c = value.charCodeAt(i++);
    if (c < 128) {
      out[out.length] = c;
    } else if (c < 2048) {
      out[out.length] = 192 + (c >>> 6);
      out[out.length] = 128 + (c & 63);
    } else if (c >= 0xd800 && c <= 0xdbff) {
      if (i >= value.length) throw new URIError('Malformed UTF-16 string');
      d = value.charCodeAt(i++);
      if (d < 0xdc00 || d > 0xdfff) throw new URIError('Malformed UTF-16 string');
      cp = 65536 + ((c - 0xd800) << 10) + (d - 0xdc00);
      out[out.length] = 240 + (cp >>> 18);
      out[out.length] = 128 + ((cp >>> 12) & 63);
      out[out.length] = 128 + ((cp >>> 6) & 63);
      out[out.length] = 128 + (cp & 63);
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new URIError('Malformed UTF-16 string');
    } else {
      out[out.length] = 224 + (c >>> 12);
      out[out.length] = 128 + ((c >>> 6) & 63);
      out[out.length] = 128 + (c & 63);
    }
  }
  return out;
}

function valueBytes(value: string | ByteArrayLike, label: string): number[] {
  if (typeof value === 'string') return utf8Bytes(value);
  return cloneBytes(value, 0, label);
}

function add32(a: number, b: number): number {
  var low = (a & 65535) + (b & 65535);
  var high = (a >>> 16) + (b >>> 16) + (low >>> 16);
  return toInt32(((high & 65535) << 16) + (low & 65535));
}

function rol(x: number, n: number): number {
  return bor32(x << n, x >>> (32 - n));
}

var MD5_K: number[] = [
  0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
  0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
  0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
  0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
  0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
  0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
  0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
  0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
];
var MD5_S: number[] = [
  7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
  5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
  4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
  6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21
];

export function md5(bytes: ByteArrayLike): number[] {
  var data = cloneBytes(bytes, 0, 'MD5 input');
  var originalLength = data.length;
  data[data.length] = 128;
  while ((data.length & 63) !== 56) data[data.length] = 0;
  var bitLength = originalLength * 8;
  var bitLow = bitLength % TWO32;
  var bitHigh = Math.floor(bitLength / TWO32);
  var j: number;
  for (j = 0; j < 4; j++) data[data.length] = (bitLow >>> (j * 8)) & 255;
  for (j = 0; j < 4; j++) data[data.length] = (bitHigh >>> (j * 8)) & 255;

  var a0 = toInt32(0x67452301);
  var b0 = toInt32(0xefcdab89);
  var c0 = toInt32(0x98badcfe);
  var d0 = toInt32(0x10325476);
  var block: number;
  var m: number[] = [];
  var i: number;
  var f: number;
  var g: number;
  var a: number;
  var b: number;
  var c: number;
  var d: number;
  var temp: number;
  var sum: number;
  for (block = 0; block < data.length; block += 64) {
    for (i = 0; i < 16; i++) {
      j = block + i * 4;
      m[i] = toInt32(data[j] + (data[j + 1] << 8) + (data[j + 2] << 16) + (data[j + 3] << 24));
    }
    a = a0; b = b0; c = c0; d = d0;
    for (i = 0; i < 64; i++) {
      if (i < 16) { f = bor32(b & c, (~b) & d); g = i; }
      else if (i < 32) { f = bor32(d & b, (~d) & c); g = (5 * i + 1) & 15; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) & 15; }
      else { f = c ^ bor32(b, ~d); g = (7 * i) & 15; }
      temp = d;
      d = c;
      c = b;
      sum = add32(add32(a, f), add32(MD5_K[i], m[g]));
      b = add32(b, rol(sum, MD5_S[i]));
      a = temp;
    }
    a0 = add32(a0, a);
    b0 = add32(b0, b);
    c0 = add32(c0, c);
    d0 = add32(d0, d);
  }

  var out: number[] = [];
  var words = [a0,b0,c0,d0];
  for (i = 0; i < 4; i++) {
    out[out.length] = words[i] & 255;
    out[out.length] = (words[i] >>> 8) & 255;
    out[out.length] = (words[i] >>> 16) & 255;
    out[out.length] = (words[i] >>> 24) & 255;
  }
  return out;
}

export function sha1(bytes: ByteArrayLike): number[] {
  var data = cloneBytes(bytes, 0, 'SHA-1 input');
  var originalLength = data.length;
  data[data.length] = 128;
  while ((data.length & 63) !== 56) data[data.length] = 0;
  var bitLength = originalLength * 8;
  var bitLow = bitLength % TWO32;
  var bitHigh = Math.floor(bitLength / TWO32);
  var j: number;
  for (j = 3; j >= 0; j--) data[data.length] = (bitHigh >>> (j * 8)) & 255;
  for (j = 3; j >= 0; j--) data[data.length] = (bitLow >>> (j * 8)) & 255;

  var h0 = toInt32(0x67452301);
  var h1 = toInt32(0xefcdab89);
  var h2 = toInt32(0x98badcfe);
  var h3 = toInt32(0x10325476);
  var h4 = toInt32(0xc3d2e1f0);
  var w: number[] = [];
  var block: number;
  var i: number;
  var a: number;
  var b: number;
  var c: number;
  var d: number;
  var e: number;
  var f: number;
  var k: number;
  var t: number;
  for (block = 0; block < data.length; block += 64) {
    for (i = 0; i < 16; i++) {
      j = block + i * 4;
      w[i] = toInt32((data[j] << 24) + (data[j + 1] << 16) + (data[j + 2] << 8) + data[j + 3]);
    }
    for (i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    a = h0; b = h1; c = h2; d = h3; e = h4;
    for (i = 0; i < 80; i++) {
      if (i < 20) { f = bor32(b & c, (~b) & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = bor32(bor32(b & c, b & d), c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      t = add32(add32(rol(a, 5), f), add32(add32(e, k), w[i]));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }
    h0 = add32(h0, a);
    h1 = add32(h1, b);
    h2 = add32(h2, c);
    h3 = add32(h3, d);
    h4 = add32(h4, e);
  }
  var out: number[] = [];
  var words = [h0,h1,h2,h3,h4];
  for (i = 0; i < 5; i++) {
    out[out.length] = (words[i] >>> 24) & 255;
    out[out.length] = (words[i] >>> 16) & 255;
    out[out.length] = (words[i] >>> 8) & 255;
    out[out.length] = words[i] & 255;
  }
  return out;
}

function nameBased(
  hash: (bytes: ByteArrayLike) => number[],
  ver: number,
  value: string | ByteArrayLike,
  namespace: string | ByteArrayLike,
  buffer?: number[],
  offset?: number
): string | number[] {
  var ns = typeof namespace === 'string' ? parse(namespace) : cloneBytes(namespace, 16, 'UUID namespace');
  if (ns.length !== 16) throw new TypeError('UUID namespace must be exactly 16 bytes');
  var valueData = valueBytes(value, 'UUID name');
  var input: number[] = [];
  var i: number;
  for (i = 0; i < 16; i++) input[i] = ns[i];
  for (i = 0; i < valueData.length; i++) input[16 + i] = valueData[i];
  var digest = hash(input);
  digest.length = 16;
  digest[6] = (digest[6] & 15) + (ver << 4);
  digest[8] = (digest[8] & 63) + 128;
  if (buffer !== undefined) assertOutput(buffer, offset);
  return emit(digest, buffer, offset);
}

export function v3(value: string | ByteArrayLike, namespace: string | ByteArrayLike, buffer?: number[], offset?: number): string | number[] {
  return nameBased(md5, 3, value, namespace, buffer, offset);
}

export function v5(value: string | ByteArrayLike, namespace: string | ByteArrayLike, buffer?: number[], offset?: number): string | number[] {
  return nameBased(sha1, 5, value, namespace, buffer, offset);
}

function randomFrom(options: RandomOptions | undefined, fallback: RandomBytesFn | null): number[] {
  if (options !== undefined && options.random !== undefined) return clonePrefixBytes(options.random, 16, 'UUID random');
  var fn = options !== undefined && options.rng !== undefined ? options.rng : fallback;
  if (fn === null || fn === undefined) {
    throw new Error('ESUUID requires ESRAND or an injected 16-byte RNG; Math.random() is never used as an entropy fallback');
  }
  return clonePrefixBytes(fn(), 16, 'UUID RNG result');
}

function validateNode(node: ByteArrayLike): number[] {
  var out = cloneBytes(node, 6, 'UUID node');
  if (out.length !== 6) throw new TypeError('UUID node must be exactly 6 bytes');
  return out;
}

function validateClockSeq(value: number): number {
  if (!isInteger(value) || value < 0 || value > 0x3fff) throw new RangeError('UUID clockseq must be an integer from 0 to 0x3fff');
  return value;
}

function timestampParts(msecs: number, nsecs: number): number[] {
  var wholeMs = msecs + GREGORIAN_OFFSET_MS;
  if (!isInteger(wholeMs) || wholeMs < 0) throw new RangeError('UUID v1/v6 timestamp is out of range');
  var highMs = Math.floor(wholeMs / TWO32);
  var lowMs = wholeMs - highMs * TWO32;
  var lowTicks = lowMs * 10000 + nsecs;
  var carry = Math.floor(lowTicks / TWO32);
  var low32 = lowTicks - carry * TWO32;
  var high28 = highMs * 10000 + carry;
  return [low32, high28];
}

function v1ToV6Bytes(input: ByteArrayLike): number[] {
  var b = cloneBytes(input, 16, 'UUID v1 bytes');
  var out: number[] = [];
  out[0] = ((b[6] & 15) << 4) + (b[7] >>> 4);
  out[1] = ((b[7] & 15) << 4) + (b[4] >>> 4);
  out[2] = ((b[4] & 15) << 4) + (b[5] >>> 4);
  out[3] = ((b[5] & 15) << 4) + (b[0] >>> 4);
  out[4] = ((b[0] & 15) << 4) + (b[1] >>> 4);
  out[5] = ((b[1] & 15) << 4) + (b[2] >>> 4);
  out[6] = 0x60 + (b[2] & 15);
  out[7] = b[3];
  var i: number;
  for (i = 8; i < 16; i++) out[i] = b[i];
  return out;
}

function v6ToV1Bytes(input: ByteArrayLike): number[] {
  var b = cloneBytes(input, 16, 'UUID v6 bytes');
  var out: number[] = [];
  out[0] = ((b[3] & 15) << 4) + (b[4] >>> 4);
  out[1] = ((b[4] & 15) << 4) + (b[5] >>> 4);
  out[2] = ((b[5] & 15) << 4) + (b[6] & 15);
  out[3] = b[7];
  out[4] = ((b[1] & 15) << 4) + (b[2] >>> 4);
  out[5] = ((b[2] & 15) << 4) + (b[3] >>> 4);
  out[6] = 0x10 + (b[0] >>> 4);
  out[7] = ((b[0] & 15) << 4) + (b[1] >>> 4);
  var i: number;
  for (i = 8; i < 16; i++) out[i] = b[i];
  return out;
}

export function v1ToV6(uuid: string): string {
  if (!validate(uuid) || version(uuid) !== 1) throw new TypeError('Expected a valid UUIDv1');
  return unsafeStringify(v1ToV6Bytes(parse(uuid)), 0);
}

export function v6ToV1(uuid: string): string {
  if (!validate(uuid) || version(uuid) !== 6) throw new TypeError('Expected a valid UUIDv6');
  return unsafeStringify(v6ToV1Bytes(parse(uuid)), 0);
}

function makeV1Bytes(
  rnds: number[],
  msecs: number,
  nsecs: number,
  clockseq: number | undefined,
  node: number[] | undefined
): number[] {
  if (!isInteger(msecs)) throw new RangeError('UUID msecs must be an integer');
  if (!isInteger(nsecs) || nsecs < 0) throw new RangeError('UUID nsecs must be a non-negative integer');
  var seq = clockseq === undefined ? (((rnds[8] << 8) + rnds[9]) & 0x3fff) : validateClockSeq(clockseq);
  var nodeBytes: number[];
  if (node === undefined) {
    nodeBytes = [(rnds[10] & 254) + 1, rnds[11], rnds[12], rnds[13], rnds[14], rnds[15]];
  } else {
    nodeBytes = validateNode(node);
  }
  var parts = timestampParts(msecs, nsecs);
  var low = parts[0];
  var high = parts[1];
  if (high > 0x0fffffff) throw new RangeError('UUID v1/v6 timestamp exceeds 60 bits');
  var out: number[] = [];
  out[0] = Math.floor(low / 16777216) & 255;
  out[1] = (low >>> 16) & 255;
  out[2] = (low >>> 8) & 255;
  out[3] = low & 255;
  out[4] = (high >>> 8) & 255;
  out[5] = high & 255;
  out[6] = 0x10 + ((high >>> 24) & 15);
  out[7] = (high >>> 16) & 255;
  out[8] = 0x80 + ((seq >>> 8) & 63);
  out[9] = seq & 255;
  var i: number;
  for (i = 0; i < 6; i++) out[10 + i] = nodeBytes[i];
  return out;
}

export function Generator(this: any, rng?: RandomBytesFn | null, nowFn?: (() => number) | null): void {
  this._rng = rng === undefined ? null : rng;
  this._nowFn = nowFn === undefined || nowFn === null ? function (): number { return new Date().getTime(); } : nowFn;
  this._v1Msecs = -9007199254740991;
  this._v1NSecs = 0;
  this._v1Node = null;
  this._v1Clockseq = 0;
  this._v7Initialized = false;
  this._v7MSecs = 0;
  this._v7Seq = 0;
}

var generatorProto: any = Generator.prototype;

generatorProto._v1Bytes = function (this: any, options?: V1Options, isV6?: boolean): number[] {
  var rnds = randomFrom(options, this._rng);
  if (options !== undefined) {
    return makeV1Bytes(
      rnds,
      options.msecs !== undefined ? options.msecs : this._nowFn(),
      options.nsecs !== undefined ? options.nsecs : 0,
      options.clockseq,
      options.node !== undefined ? validateNode(options.node) : undefined
    );
  }

  var now = this._nowFn();
  if (now === this._v1Msecs) {
    this._v1NSecs++;
    if (this._v1NSecs >= 10000) {
      this._v1Node = null;
      this._v1NSecs = 0;
    }
  } else if (now > this._v1Msecs) {
    this._v1NSecs = 0;
  } else {
    this._v1Node = null;
  }

  if (this._v1Node === null) {
    this._v1Node = [(rnds[10] & 254) + 1, rnds[11], rnds[12], rnds[13], rnds[14], rnds[15]];
    this._v1Clockseq = ((rnds[8] << 8) + rnds[9]) & 0x3fff;
  }
  this._v1Msecs = now;
  return makeV1Bytes(
    rnds,
    this._v1Msecs,
    this._v1NSecs,
    isV6 ? undefined : this._v1Clockseq,
    isV6 ? undefined : this._v1Node
  );
};

generatorProto.v1 = function (this: any, options?: V1Options, buffer?: number[], offset?: number): string | number[] {
  if (buffer !== undefined) assertOutput(buffer, offset);
  return emit(this._v1Bytes(options, false), buffer, offset);
};

generatorProto.v4 = function (this: any, options?: RandomOptions, buffer?: number[], offset?: number): string | number[] {
  if (buffer !== undefined) assertOutput(buffer, offset);
  var bytes = randomFrom(options, this._rng);
  bytes.length = 16;
  bytes[6] = (bytes[6] & 15) + 64;
  bytes[8] = (bytes[8] & 63) + 128;
  return emit(bytes, buffer, offset);
};

generatorProto.v6 = function (this: any, options?: V1Options, buffer?: number[], offset?: number): string | number[] {
  if (buffer !== undefined) assertOutput(buffer, offset);
  var bytes = v1ToV6Bytes(this._v1Bytes(options, true));
  return emit(bytes, buffer, offset);
};

generatorProto.v7 = function (this: any, options?: V7Options, buffer?: number[], offset?: number): string | number[] {
  if (buffer !== undefined) assertOutput(buffer, offset);
  var rnds = randomFrom(options, this._rng);
  var msecs: number;
  var seq: number;
  if (options !== undefined) {
    msecs = options.msecs !== undefined ? options.msecs : this._nowFn();
    seq = options.seq !== undefined ? options.seq : v7Sequence(rnds);
    if (options.seq !== undefined && (!isInteger(seq) || seq < 0 || seq > 4294967295)) {
      throw new RangeError('UUIDv7 seq must be an unsigned 32-bit integer');
    }
  } else {
    var now = this._nowFn();
    if (!this._v7Initialized || now > this._v7MSecs) {
      this._v7MSecs = now;
      this._v7Seq = v7Sequence(rnds);
      this._v7Initialized = true;
    } else {
      this._v7Seq = toInt32(this._v7Seq + 1);
      if (this._v7Seq === 0) this._v7MSecs++;
    }
    msecs = this._v7MSecs;
    seq = this._v7Seq;
  }
  if (!isInteger(msecs) || msecs < 0 || msecs > MAX_V7_MSECS) throw new RangeError('UUIDv7 msecs must fit the unsigned 48-bit timestamp');
  seq = toInt32(seq);
  var out: number[] = [];
  out[0] = Math.floor(msecs / 0x10000000000) & 255;
  out[1] = Math.floor(msecs / 0x100000000) & 255;
  out[2] = Math.floor(msecs / 0x1000000) & 255;
  out[3] = Math.floor(msecs / 0x10000) & 255;
  out[4] = Math.floor(msecs / 0x100) & 255;
  out[5] = msecs & 255;
  out[6] = 0x70 + ((seq >>> 28) & 15);
  out[7] = (seq >>> 20) & 255;
  out[8] = 0x80 + ((seq >>> 14) & 63);
  out[9] = (seq >>> 6) & 255;
  out[10] = ((seq << 2) & 255) + (rnds[10] & 3);
  out[11] = rnds[11];
  out[12] = rnds[12];
  out[13] = rnds[13];
  out[14] = rnds[14];
  out[15] = rnds[15];
  return emit(out, buffer, offset);
};

function v7Sequence(rnds: ByteArrayLike): number {
  return ((rnds[6] & 127) << 24) + (rnds[7] << 16) + (rnds[8] << 8) + rnds[9];
}

export function create(options?: FactoryOptions): UUIDGenerator {
  var opts = options === undefined ? {} : options;
  var rng: RandomBytesFn | null = null;
  if (opts.rng !== undefined) rng = opts.rng;
  else if (opts.rand !== undefined && opts.rand !== null && typeof opts.rand.bytes === 'function') {
    var rand = opts.rand;
    rng = function (): number[] { return rand.bytes(16); };
  }
  return new (Generator as any)(rng, opts.now === undefined ? null : opts.now) as UUIDGenerator;
}

var DEFAULT: UUIDGenerator = create();

export function v1(options?: V1Options, buffer?: number[], offset?: number): string | number[] {
  return DEFAULT.v1(options, buffer, offset);
}
export function v4(options?: RandomOptions, buffer?: number[], offset?: number): string | number[] {
  return DEFAULT.v4(options, buffer, offset);
}
export function v6(options?: V1Options, buffer?: number[], offset?: number): string | number[] {
  return DEFAULT.v6(options, buffer, offset);
}
export function v7(options?: V7Options, buffer?: number[], offset?: number): string | number[] {
  return DEFAULT.v7(options, buffer, offset);
}
