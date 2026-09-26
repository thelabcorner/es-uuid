(function () {
  var args = $.global.__comtool_v2_runfile_args;
  if (!args || args.length < 4) throw new Error("ESSTR native probe requires ESTIMER + ESUUID + prototype + ESSTRTrim.dll");
  var estimerPath = String(args[0]);
  var esuuidPath = String(args[1]);
  var protoPath = String(args[2]);
  var dllPath = String(args[3]);

  var prevTimer = $.global.ESTIMER;
  var prevUuid = $.global.ESUUID;
  var prevProto = $.global.__ESUUID_SIBLING_PROTO__;
  var prevRand = $.global.ESRAND;
  var lib = null;

  function load(path, name) {
    var f = File(path);
    if (!f.exists) throw new Error("missing " + name + ": " + f.fsName);
    $.evalFile(f);
  }
  function measure(T, fn) {
    var sink;
    T.prime();
    var samples = T.samples(9, function () { sink = fn(); return sink; }, {
      warmup: 5,
      collectRejected: true,
      maxValidUs: 10000000
    });
    var s = T.stats(samples);
    var rejected = samples.rejected && samples.rejected.length ? samples.rejected.length : 0;
    if (s.count !== 9 || !(s.median > 0)) throw new Error("bad timing set");
    return [s.median,s.min,s.p95,s.count,rejected].join("|");
  }

  try {
    $.global.ESTIMER = void 0;
    $.global.ESUUID = void 0;
    $.global.__ESUUID_SIBLING_PROTO__ = void 0;
    $.global.ESRAND = void 0;
    load(estimerPath, "ESTIMER");
    load(esuuidPath, "ESUUID");
    load(protoPath, "prototype");

    var T = $.global.ESTIMER;
    var U = $.global.ESUUID;
    var P = $.global.__ESUUID_SIBLING_PROTO__;
    if (!T || !U || !P) throw new Error("globals missing");

    var uuid = "919108f7-52d1-4320-9bac-f847db4148a8";
    if (P.esstrTrim(uuid) !== uuid) throw new Error("pure trim identity failed");
    if (U.validate("  " + uuid + "  ")) throw new Error("padded UUID baseline unexpectedly valid");
    if (!U.validate(P.esstrTrim("  " + uuid + "  "))) throw new Error("pure trim semantic probe failed");

    var bytes = U.parse(uuid);
    var names = [], i, b;
    for (i = 0; i < 64; i++) {
      b = bytes.slice(0);
      b[15] = i;
      names[i] = U.stringify(b);
    }

    function makeValidate() {
      var idx = 0;
      return function () {
        var j, yes = 0;
        for (j = 0; j < 64; j++) {
          if (U.validate(names[idx++])) yes++;
          if (idx >= 64) idx = 0;
        }
        return yes;
      };
    }
    function makeTrimValidate() {
      var idx = 0;
      return function () {
        var j, yes = 0, s;
        for (j = 0; j < 64; j++) {
          s = P.esstrTrim(names[idx++]);
          if (idx >= 64) idx = 0;
          if (U.validate(s)) yes++;
        }
        return yes;
      };
    }

    P.esstrDisableNativeGate();
    P.esstrClearMemo();
    var baseline = measure(T, makeValidate());
    P.esstrClearMemo();
    var pure = measure(T, makeTrimValidate());

    var dll = File(dllPath);
    if (!dll.exists) throw new Error("missing ESSTRTrim.dll: " + dll.fsName);
    lib = new ExternalObject("lib:" + dll.fsName);
    var report = P.esstrEnableNativeGate({lib:lib,dllPath:dll.fsName,minLength:0});
    if (!report || !report.enabled) throw new Error("ESSTR native gate did not enable: " + String(report && report.reason));
    if (P.esstrTrim(uuid) !== uuid) throw new Error("native trim identity failed");
    if (!U.validate(P.esstrTrim("  " + uuid + "  "))) throw new Error("native trim semantic probe failed");
    var nativeLane = measure(T, makeTrimValidate());

    return "ESSTR_NATIVE|" + baseline + "|" + pure + "|" + nativeLane +
      "|Illustrator=" + app.version + "|ExtendScript=" + $.version;
  } finally {
    try {
      if ($.global.__ESUUID_SIBLING_PROTO__ && $.global.__ESUUID_SIBLING_PROTO__.esstrDisableNativeGate) {
        $.global.__ESUUID_SIBLING_PROTO__.esstrDisableNativeGate();
      }
    } catch (_) {}
    try { if (lib) lib.unload(); } catch (_) {}
    $.global.ESTIMER = prevTimer;
    $.global.ESUUID = prevUuid;
    $.global.__ESUUID_SIBLING_PROTO__ = prevProto;
    $.global.ESRAND = prevRand;
  }
}());
