(function () {
  var args = $.global.__comtool_v2_runfile_args;
  if (!args || args.length < 5) throw new Error("sibling lane requires lane + ESTIMER + ESUUID + prototype + ESChars.dll paths");

  var lane = String(args[0]);
  var estimerPath = String(args[1]);
  var esuuidPath = String(args[2]);
  var protoPath = String(args[3]);
  var escharsDll = String(args[4]);

  var prevTimer = $.global.ESTIMER;
  var prevUuid = $.global.ESUUID;
  var prevProto = $.global.__ESUUID_SIBLING_PROTO__;
  var prevRand = $.global.ESRAND;

  function load(path, name) {
    var f = File(path);
    if (!f.exists) throw new Error("missing " + name + ": " + f.fsName);
    $.evalFile(f);
  }
  function nib(c) {
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 70) return c - 55;
    if (c >= 97 && c <= 102) return c - 87;
    return -1;
  }
  function hexToBytes(hex) {
    var out = [], i, hi, lo;
    if ((hex.length & 1) !== 0) throw new Error("odd hex");
    for (i = 0; i < hex.length; i += 2) {
      hi = nib(hex.charCodeAt(i));
      lo = nib(hex.charCodeAt(i + 1));
      if (hi < 0 || lo < 0) throw new Error("bad hex");
      out[out.length] = (hi << 4) + lo;
    }
    return out;
  }
  function utf8Js(value) {
    var out = [], i = 0, c, d, cp;
    while (i < value.length) {
      c = value.charCodeAt(i++);
      if (c < 128) out[out.length] = c;
      else if (c < 2048) {
        out[out.length] = 192 + (c >>> 6);
        out[out.length] = 128 + (c & 63);
      } else if (c >= 0xd800 && c <= 0xdbff) {
        if (i >= value.length) throw new URIError("Malformed UTF-16 string");
        d = value.charCodeAt(i++);
        if (d < 0xdc00 || d > 0xdfff) throw new URIError("Malformed UTF-16 string");
        cp = 65536 + ((c - 0xd800) << 10) + (d - 0xdc00);
        out[out.length] = 240 + (cp >>> 18);
        out[out.length] = 128 + ((cp >>> 12) & 63);
        out[out.length] = 128 + ((cp >>> 6) & 63);
        out[out.length] = 128 + (cp & 63);
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        throw new URIError("Malformed UTF-16 string");
      } else {
        out[out.length] = 224 + (c >>> 12);
        out[out.length] = 128 + ((c >>> 6) & 63);
        out[out.length] = 128 + (c & 63);
      }
    }
    return out;
  }
  function arraysEqual(a, b) {
    var i;
    if (!a || !b || a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function validEschars(uuid, P) {
    if (typeof uuid !== "string" || uuid.length !== 36) return false;
    if (uuid.charAt(8) !== "-" || uuid.charAt(13) !== "-" || uuid.charAt(18) !== "-" || uuid.charAt(23) !== "-") return false;
    var i, code, ver, variant;
    for (i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) continue;
      code = P.escharsCharCodeAt(uuid, i);
      if (nib(code) < 0) return false;
    }
    var lower = uuid.toLowerCase();
    if (lower === "00000000-0000-0000-0000-000000000000" ||
        lower === "ffffffff-ffff-ffff-ffff-ffffffffffff") return true;
    ver = nib(P.escharsCharCodeAt(uuid, 14));
    if (ver < 1 || ver > 8) return false;
    variant = nib(P.escharsCharCodeAt(uuid, 19));
    return variant >= 8 && variant <= 11;
  }
  function parseEschars(uuid, P) {
    if (!validEschars(uuid, P)) throw new TypeError("Invalid UUID");
    var out = [], oi = 0, i = 0;
    while (i < 36) {
      if (uuid.charAt(i) === "-") { i++; continue; }
      out[oi++] = (nib(P.escharsCharCodeAt(uuid, i)) << 4) + nib(P.escharsCharCodeAt(uuid, i + 1));
      i += 2;
    }
    return out;
  }
  var HEX = [], h;
  for (h = 0; h < 256; h++) HEX[h] = (h + 256).toString(16).substr(1);
  function stringifyDirect(a, U) {
    var i = 0;
    var s = HEX[a[i++]] + HEX[a[i++]] + HEX[a[i++]] + HEX[a[i++]] + "-" +
      HEX[a[i++]] + HEX[a[i++]] + "-" + HEX[a[i++]] + HEX[a[i++]] + "-" +
      HEX[a[i++]] + HEX[a[i++]] + "-" + HEX[a[i++]] + HEX[a[i++]] +
      HEX[a[i++]] + HEX[a[i++]] + HEX[a[i++]] + HEX[a[i++]];
    if (!U.validate(s)) throw new Error("direct stringify invalid");
    return s;
  }
  function stringifyEsarr(a, P, U) {
    var pieces = P.esarrMap(a, function (v) { return HEX[v]; });
    var s = pieces[0] + pieces[1] + pieces[2] + pieces[3] + "-" +
      pieces[4] + pieces[5] + "-" + pieces[6] + pieces[7] + "-" +
      pieces[8] + pieces[9] + "-" + pieces[10] + pieces[11] +
      pieces[12] + pieces[13] + pieces[14] + pieces[15];
    if (!U.validate(s)) throw new Error("ESARR stringify invalid");
    return s;
  }
  function copyFor(a) {
    var out = [], i;
    for (i = 0; i < 16; i++) out[i] = a[i];
    return out;
  }
  function emitFor(a, out) {
    var i;
    for (i = 0; i < 16; i++) out[i] = a[i];
    return out;
  }
  function emitEach(a, out, P) {
    P.esarrForEach(a, function (v, i) { out[i] = v; });
    return out;
  }
  function repeatText(seed, n) {
    var s = "";
    while (s.length < n) s += seed;
    return s.substring(0, n);
  }
  function runMeasure(T, batch, warmup, count, fn) {
    var sink;
    function batched() {
      var i;
      for (i = 0; i < batch; i++) sink = fn();
      return sink;
    }
    T.prime();
    var samples = T.samples(count, batched, {
      warmup: warmup,
      collectRejected: true,
      maxValidUs: 120000000
    });
    var stats = T.stats(samples);
    var rejected = samples.rejected && samples.rejected.length ? samples.rejected.length : 0;
    if (stats.count !== count || !(stats.median > 0)) throw new Error("bad timing lane " + lane);
    return [batch, stats.median, stats.min, stats.p95, stats.count, rejected].join("|");
  }

  try {
    $.global.ESTIMER = void 0;
    $.global.ESUUID = void 0;
    $.global.__ESUUID_SIBLING_PROTO__ = void 0;
    $.global.ESRAND = void 0;

    load(estimerPath, "ESTIMER");
    load(esuuidPath, "ESUUID");
    load(protoPath, "sibling prototype");

    var T = $.global.ESTIMER;
    var U = $.global.ESUUID;
    var P = $.global.__ESUUID_SIBLING_PROTO__;
    if (!T || !U || !P) throw new Error("prototype globals missing");
    P.escharsLoad({path: escharsDll});

    var uuid = "919108f7-52d1-4320-9bac-f847db4148a8";
    var bytes = U.parse(uuid);
    var unicode = "h\u00e9llo \ud83d\ude00 UUID";
    var shortName = "www.example.com";
    var name1k = repeatText("Abc\u00e9\ud83d\ude00-", 1024);
    var name4k = repeatText("Abc\u00e9\ud83d\ude00-", 4096);
    var out = [];
    var i;

    if (lane === "correctness") {
      var checks = 0;
      function yes(v, label) { if (!v) throw new Error("correctness: " + label); checks++; }
      function equal(a, b, label) { if (a !== b) throw new Error("correctness: " + label + " expected=" + b + " actual=" + a); checks++; }

      yes(validEschars(uuid, P), "ESCHARS validate");
      yes(validEschars(U.NIL, P), "ESCHARS validate NIL parity");
      yes(validEschars(U.MAX, P), "ESCHARS validate MAX parity");
      yes(arraysEqual(parseEschars(uuid, P), bytes), "ESCHARS parse");
      yes(arraysEqual(utf8Js(unicode), hexToBytes(P.escharsHexEncode(unicode))), "ESCHARS UTF-8 Unicode");
      equal(U.v5(unicode, U.DNS), U.v5(hexToBytes(P.escharsHexEncode(unicode)), U.DNS), "ESCHARS v5 Unicode");
      equal(U.v3(unicode, U.DNS), U.v3(hexToBytes(P.escharsHexEncode(unicode)), U.DNS), "ESCHARS v3 Unicode");

      var nulName = "a" + String.fromCharCode(0) + "b";
      var nulParity = false;
      var nulBehavior = "unknown";
      try {
        nulParity = U.v5(nulName, U.DNS) === U.v5(hexToBytes(P.escharsHexEncode(nulName)), U.DNS);
        nulBehavior = nulParity ? "parity" : "mismatch";
      } catch (nulErr) {
        nulBehavior = "throws:" + String(nulErr);
      }
      checks++;

      equal(P.esstrTrim(uuid), uuid, "ESSTR clean identity");
      yes(!U.validate("  " + uuid + "  "), "padded UUID baseline invalid");
      yes(U.validate(P.esstrTrim("  " + uuid + "  ")), "ESSTR trim changes padded semantics");

      equal(stringifyDirect(bytes, U), uuid, "direct stringify");
      equal(stringifyEsarr(bytes, P, U), uuid, "ESARR map stringify");
      yes(arraysEqual(copyFor(bytes), P.esarrMap(bytes, function (v) { return v; })), "ESARR map copy");
      yes(arraysEqual(copyFor(bytes), P.esarrSlice(bytes, 0, 16)), "ESARR slice copy");
      var a = [], b = [];
      yes(arraysEqual(emitFor(bytes, a), emitEach(bytes, b, P)), "ESARR forEach emit");

      return "CORRECT|" + checks + "|nul=" + nulBehavior + "|Illustrator=" + app.version + "|ExtendScript=" + $.version;
    }

    var fn = null, batch = 1, warmup = 5, count = 9;
    if (lane === "validate.baseline") {
      batch = 100; fn = function () { return U.validate(uuid); };
    } else if (lane === "validate.eschars-char") {
      batch = 2; fn = function () { return validEschars(uuid, P); };
    } else if (lane === "parse.baseline") {
      batch = 50; fn = function () { return U.parse(uuid); };
    } else if (lane === "parse.eschars-char") {
      batch = 1; fn = function () { return parseEschars(uuid, P); };
    } else if (lane === "utf8.1k-js") {
      batch = 5; fn = function () { return utf8Js(name1k); };
    } else if (lane === "utf8.1k-eschars-hex") {
      batch = 5; fn = function () { return hexToBytes(P.escharsHexEncode(name1k)); };
    } else if (lane === "utf8.4k-js") {
      batch = 1; warmup = 3; count = 7; fn = function () { return utf8Js(name4k); };
    } else if (lane === "utf8.4k-eschars-hex") {
      batch = 1; warmup = 3; count = 7; fn = function () { return hexToBytes(P.escharsHexEncode(name4k)); };
    } else if (lane === "v5.short-baseline") {
      batch = 5; fn = function () { return U.v5(shortName, U.DNS); };
    } else if (lane === "v5.short-eschars-hex") {
      batch = 5; fn = function () { return U.v5(hexToBytes(P.escharsHexEncode(shortName)), U.DNS); };
    } else if (lane === "v5.1k-baseline") {
      warmup = 2; count = 5; fn = function () { return U.v5(name1k, U.DNS); };
    } else if (lane === "v5.1k-eschars-hex") {
      warmup = 2; count = 5; fn = function () { return U.v5(hexToBytes(P.escharsHexEncode(name1k)), U.DNS); };
    } else if (lane === "v3.1k-baseline") {
      warmup = 2; count = 5; fn = function () { return U.v3(name1k, U.DNS); };
    } else if (lane === "v3.1k-eschars-hex") {
      warmup = 2; count = 5; fn = function () { return U.v3(hexToBytes(P.escharsHexEncode(name1k)), U.DNS); };
    } else if (lane === "validate64.baseline") {
      var names = [];
      for (i = 0; i < 64; i++) {
        var bb = bytes.slice(0);
        bb[15] = i;
        names[i] = U.stringify(bb);
      }
      var idx = 0;
      fn = function () {
        var j, yesCount = 0;
        for (j = 0; j < 64; j++) {
          if (U.validate(names[idx++])) yesCount++;
          if (idx >= 64) idx = 0;
        }
        return yesCount;
      };
    } else if (lane === "validate64.esstr-trim") {
      var names2 = [];
      for (i = 0; i < 64; i++) {
        var bc = bytes.slice(0);
        bc[15] = i;
        names2[i] = U.stringify(bc);
      }
      var idx2 = 0;
      P.esstrClearMemo();
      fn = function () {
        var j, yesCount = 0, s;
        for (j = 0; j < 64; j++) {
          s = P.esstrTrim(names2[idx2++]);
          if (idx2 >= 64) idx2 = 0;
          if (U.validate(s)) yesCount++;
        }
        return yesCount;
      };
    } else if (lane === "stringify.direct") {
      batch = 100; fn = function () { return stringifyDirect(bytes, U); };
    } else if (lane === "stringify.esarr-map") {
      batch = 25; fn = function () { return stringifyEsarr(bytes, P, U); };
    } else if (lane === "copy16.for") {
      batch = 500; fn = function () { return copyFor(bytes); };
    } else if (lane === "copy16.esarr-map") {
      batch = 100; fn = function () { return P.esarrMap(bytes, function (v) { return v; }); };
    } else if (lane === "copy16.esarr-slice") {
      batch = 100; fn = function () { return P.esarrSlice(bytes, 0, 16); };
    } else if (lane === "emit16.for") {
      batch = 500; fn = function () { return emitFor(bytes, out); };
    } else if (lane === "emit16.esarr-foreach") {
      batch = 100; fn = function () { return emitEach(bytes, out, P); };
    } else {
      throw new Error("unknown sibling lane: " + lane);
    }

    return "LANE|" + lane + "|" + runMeasure(T, batch, warmup, count, fn) +
      "|Illustrator=" + app.version + "|ExtendScript=" + $.version;
  } finally {
    try {
      if ($.global.__ESUUID_SIBLING_PROTO__ && $.global.__ESUUID_SIBLING_PROTO__.escharsUnload) {
        $.global.__ESUUID_SIBLING_PROTO__.escharsUnload();
      }
    } catch (_) {}
    $.global.ESTIMER = prevTimer;
    $.global.ESUUID = prevUuid;
    $.global.__ESUUID_SIBLING_PROTO__ = prevProto;
    $.global.ESRAND = prevRand;
  }
}());
