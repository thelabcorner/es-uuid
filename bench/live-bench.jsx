(function () {
  var args = $.global.__comtool_v2_runfile_args;
  if (!args || args.length < 4) throw new Error("ESUUID benchmark requires lane + ESTIMER + ESRAND + ESUUID paths");

  var lane = String(args[0]);
  var estimerPath = String(args[1]);
  var esrandPath = String(args[2]);
  var esuuidPath = String(args[3]);

  var previousTimer = $.global.ESTIMER;
  var previousRand = $.global.ESRAND;
  var previousUuid = $.global.ESUUID;

  function load(path, globalName) {
    var file = File(path);
    if (!file.exists) throw new Error("Missing " + globalName + " artifact: " + file.fsName);
    $.evalFile(file);
    var value = $.global[globalName];
    if (!value) throw new Error(globalName + " did not install on $.global");
    return value;
  }

  try {
    $.global.ESTIMER = void 0;
    $.global.ESRAND = void 0;
    $.global.ESUUID = void 0;

    var T = load(estimerPath, "ESTIMER");
    var isMathFallbackLane = lane === "v4-math" || lane === "v7-math";
    var R = null;
    if (!isMathFallbackLane) R = load(esrandPath, "ESRAND");
    var U = load(esuuidPath, "ESUUID");

    var fixed = [], i;
    for (i = 0; i < 16; i++) fixed[i] = (i * 29 + 17) & 255;
    var parsed = U.parse("919108f7-52d1-4320-9bac-f847db4148a8");
    var generator = null;
    if (R !== null) {
      var seeded = R.create("esuuid-live-benchmark|" + lane);
      generator = U.create({
        rand: seeded,
        now: function () { return 1700000000000; }
      });
    }

    var batch = 0;
    var op = null;
    var sink = null;

    if (lane === "v4-esrand") {
      batch = 250;
      op = function () { sink = generator.v4(); };
    } else if (lane === "v4-math") {
      batch = 250;
      op = function () { sink = U.v4(); };
    } else if (lane === "v4-explicit") {
      batch = 500;
      op = function () { sink = U.v4({random:fixed}); };
    } else if (lane === "v7-esrand") {
      batch = 250;
      op = function () { sink = generator.v7(); };
    } else if (lane === "v7-math") {
      batch = 250;
      op = function () { sink = U.v7(); };
    } else if (lane === "v7-explicit") {
      batch = 500;
      op = function () { sink = U.v7({random:fixed,msecs:1700000000000,seq:0x12345678}); };
    } else if (lane === "parse") {
      batch = 1000;
      op = function () { sink = U.parse("919108f7-52d1-4320-9bac-f847db4148a8"); };
    } else if (lane === "stringify") {
      batch = 1000;
      op = function () { sink = U.stringify(parsed); };
    } else if (lane === "v5") {
      batch = 50;
      op = function () { sink = U.v5("www.example.com", U.DNS); };
    } else {
      throw new Error("Unknown ESUUID benchmark lane: " + lane);
    }

    function batchOp() {
      var j;
      for (j = 0; j < batch; j++) op();
      return sink;
    }

    T.prime();
    var samples = T.samples(9, batchOp, {
      warmup: 5,
      collectRejected: true,
      maxValidUs: 100000000
    });
    var stats = T.stats(samples);
    var rejected = samples.rejected && samples.rejected.length ? samples.rejected.length : 0;

    if (stats.count !== 9 || stats.median <= 0) {
      throw new Error("Invalid ESTIMER sample set for " + lane + ": count=" + stats.count + " median=" + stats.median);
    }

    return "ESUUID_BENCH|" + lane + "|" + batch + "|" +
      stats.median + "|" + stats.min + "|" + stats.p95 + "|" +
      stats.count + "|" + rejected +
      "|Illustrator=" + app.version + "|ExtendScript=" + $.version;
  } finally {
    $.global.ESUUID = previousUuid;
    $.global.ESRAND = previousRand;
    $.global.ESTIMER = previousTimer;
  }
}());
