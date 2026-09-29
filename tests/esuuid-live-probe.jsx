(function () {
  var testDir = File($.fileName).parent;
  var projectDir = testDir.parent;
  var scriptsDir = projectDir.parent;
  var esuuidFile = File(projectDir.fsName + "/dist/ESUUID.jsx");
  var esuuidMinFile = File(projectDir.fsName + "/dist/ESUUID.min.jsx");
  var esrandFile = File(scriptsDir.fsName + "/esrand/dist/vendor-esrand.js");
  var previousRand = $.global.ESRAND;
  var previousUuid = $.global.ESUUID;
  var previousWarn = $.global.__ESUUID_WARN__;
  var checks = 0;
  var result = "";

  function assertTrue(value, label) {
    if (!value) throw new Error("ESUUID live check failed: " + label);
    checks++;
  }
  function assertEq(actual, expected, label) {
    if (actual !== expected) {
      throw new Error("ESUUID live check failed: " + label + " expected=" + expected + " actual=" + actual);
    }
    checks++;
  }
  function zeros() {
    var a = [], i;
    for (i = 0; i < 16; i++) a[i] = 0;
    return a;
  }

  try {
    if (!esuuidFile.exists) throw new Error("ESUUID artifact not found: " + esuuidFile.fsName);
    if (!esuuidMinFile.exists) throw new Error("ESUUID min artifact not found: " + esuuidMinFile.fsName);
    if (!esrandFile.exists) throw new Error("ESRAND vendor artifact not found: " + esrandFile.fsName);

    // Dogfood the real sibling ESRAND distribution. ESUUID's runtime contract is
    // deliberately tiny: an ESRAND-compatible object exposing bytes(count).
    $.global.ESRAND = void 0;
    $.global.ESUUID = void 0;
    $.evalFile(esrandFile);
    assertTrue(typeof ESRAND !== "undefined" && typeof ESRAND.bytes === "function", "real ESRAND byte-source contract");

    $.evalFile(esuuidFile);
    assertTrue(typeof ESUUID !== "undefined", "ESUUID global loads");
    assertEq(ESUUID.VERSION, "0.2.0", "VERSION");
    assertEq(ESUUID.capabilities().standard, "RFC 9562", "standard metadata");
    assertEq(ESUUID.capabilities().entropy, "ESRAND", "ESRAND entropy backend");
    assertEq(ESUUID.capabilities().cryptographic, false, "entropy truthfulness");

    assertEq(
      ESUUID.v1({msecs:1645557742000,nsecs:0,clockseq:0x33c8,node:[0x9f,0x6b,0xde,0xce,0xd8,0x46],random:zeros()}),
      "c232ab00-9414-11ec-b3c8-9f6bdeced846",
      "RFC v1"
    );
    assertEq(ESUUID.v3("www.example.com", ESUUID.DNS), "5df41881-3aed-3515-88a7-2f4a814cf09e", "RFC v3");

    var r4 = [0x91,0x91,0x08,0xf7,0x52,0xd1,0x33,0x20,0x5b,0xac,0xf8,0x47,0xdb,0x41,0x48,0xa8];
    assertEq(ESUUID.v4({random:r4}), "919108f7-52d1-4320-9bac-f847db4148a8", "RFC v4");
    assertEq(ESUUID.v5("www.example.com", ESUUID.DNS), "2ed6657d-e927-568b-95e1-2665a8aea6a2", "RFC v5");
    assertEq(
      ESUUID.v6({msecs:1645557742000,nsecs:0,clockseq:0x33c8,node:[0x9f,0x6b,0xde,0xce,0xd8,0x46],random:zeros()}),
      "1ec9414c-232a-6b00-b3c8-9f6bdeced846",
      "RFC v6"
    );

    var r7 = zeros();
    r7[10]=0xdc; r7[11]=0x0c; r7[12]=0x0c; r7[13]=0x07; r7[14]=0x39; r7[15]=0x8f;
    assertEq(
      ESUUID.v7({msecs:1645557742000,seq:0xcc363137,random:r7}),
      "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
      "RFC v7"
    );

    var parsed = ESUUID.parse("00112233-4455-6677-8899-aabbccddeeff");
    assertEq(parsed.length, 16, "parse length");
    assertEq(parsed[0], 0x00, "parse byte 0");
    assertEq(parsed[15], 0xff, "parse byte 15");
    assertEq(ESUUID.stringify(parsed), "00112233-4455-6677-8899-aabbccddeeff", "stringify");
    assertTrue(ESUUID.validate("00000000-0000-8000-8000-000000000000"), "v8 validate");
    assertEq(ESUUID.version("00000000-0000-8000-8000-000000000000"), 8, "v8 version");
    assertEq(ESUUID.version(ESUUID.NIL), 0, "NIL version");
    assertEq(ESUUID.version(ESUUID.MAX), 15, "MAX version");

    var v1Known = "92f62d9e-22c4-11ef-97e9-325096b39f47";
    var v6Known = "1ef22c49-2f62-6d9e-97e9-325096b39f47";
    assertEq(ESUUID.v1ToV6(v1Known), v6Known, "v1ToV6");
    assertEq(ESUUID.v6ToV1(v6Known), v1Known, "v6ToV1");

    var d4 = ESUUID.v4();
    var d7a = ESUUID.v7();
    var d7b = ESUUID.v7();
    assertTrue(ESUUID.validate(d4) && ESUUID.version(d4) === 4, "ESRAND default v4");
    assertTrue(ESUUID.validate(d7a) && ESUUID.version(d7a) === 7, "ESRAND default v7");
    assertTrue(d7a < d7b, "default v7 monotonic");

    // Factory options such as a custom clock must retain the facade's ESRAND
    // backend unless the caller explicitly supplies another entropy source.
    var customClock = ESUUID.create({now:function(){return 1700000000000;}});
    assertTrue(ESUUID.validate(customClock.v4()), "create({now}) inherits ESRAND");

    var mockRandCalls = 0;
    var mockRand = {bytes:function(count){ mockRandCalls++; return zeros(); }};
    var explicitRand = ESUUID.create({rand:mockRand,now:function(){return 1700000000000;}});
    assertEq(explicitRand.v4(), "00000000-0000-4000-8000-000000000000", "create({rand}) explicit backend");
    assertEq(mockRandCalls, 1, "create({rand}) consumes one entropy block");
    var explicitRng = ESUUID.create({rng:function(){return r4;}});
    assertEq(explicitRng.v4(), "919108f7-52d1-4320-9bac-f847db4148a8", "create({rng}) overrides facade ESRAND");

    var longRandom = [], i;
    for (i = 0; i < 20; i++) longRandom[i] = 0;
    longRandom[16] = 999; longRandom[17] = -1;
    assertEq(ESUUID.v4({random:longRandom}), "00000000-0000-4000-8000-000000000000", "entropy prefix ignores tail");

    var defaultV1 = ESUUID.create({rng:function(){return zeros();},now:function(){return 1700000000000;}}).v1();
    assertTrue((ESUUID.parse(defaultV1)[10] & 1) === 1, "v1 generated node multicast bit");
    assertTrue(ESUUID.validate(ESUUID.v1({msecs:1645557742000,nsecs:10000,clockseq:0x33c8,node:[1,2,3,4,5,6],random:zeros()})), "v1 nsecs carry");
    assertTrue(ESUUID.validate(ESUUID.v7({msecs:1645557742000,seq:4294967295,random:zeros()})), "v7 unsigned max sequence");

    var threw = false;
    try { ESUUID.v4({random:zeros()}, new Array(15), 0); } catch (e) { threw = true; }
    assertTrue(threw, "buffer bounds guard");
    threw = false;
    try { ESUUID.v5("www.example.com", ESUUID.DNS, new Array(16), 1); } catch (e2) { threw = true; }
    assertTrue(threw, "name-based offset bounds guard");
    threw = false;
    try { ESUUID.create({rng:function(){return new Array(15);}}).v4(); } catch (e3) { threw = true; }
    assertTrue(threw, "short injected RNG rejected");
    threw = false;
    try { ESUUID.v1ToV6(ESUUID.v4({random:zeros()})); } catch (e4) { threw = true; }
    assertTrue(threw, "v1ToV6 rejects wrong version");

    // Reloading the same compatible build must preserve stateful generator
    // identity rather than silently resetting v1/v7 monotonic state.
    var facadeBeforeReload = ESUUID;
    var reloadBefore = ESUUID.v7();
    $.evalFile(esuuidFile);
    assertTrue(ESUUID === facadeBeforeReload, "same-version reload preserves facade");
    var reloadAfter = ESUUID.v7();
    assertTrue(reloadBefore < reloadAfter, "same-version reload preserves monotonic state");

    // Fresh-load without ESRAND falls back to Math.random, but does so loudly
    // and truthfully. The warning is emitted once on first entropy use, not at
    // library load time.
    var realRand = $.global.ESRAND;
    var fallbackWarnings = [];
    $.global.ESUUID = void 0;
    $.global.ESRAND = void 0;
    $.global.__ESUUID_WARN__ = function(message){ fallbackWarnings.push(String(message)); };
    $.evalFile(esuuidFile);
    assertEq(ESUUID.capabilities().entropy, "Math.random-fallback", "missing ESRAND capability");
    assertEq(
      ESUUID.v4({random:zeros()}),
      "00000000-0000-4000-8000-000000000000",
      "caller entropy bypasses Math.random fallback"
    );
    assertEq(fallbackWarnings.length, 0, "caller entropy emits no fallback warning");
    assertTrue(ESUUID.validate(ESUUID.v1()), "Math.random fallback v1");
    assertTrue(ESUUID.validate(ESUUID.v4()), "Math.random fallback v4");
    assertEq(fallbackWarnings.length, 1, "Math.random fallback warns on first use");
    assertTrue(ESUUID.validate(ESUUID.v6()), "Math.random fallback v6");
    assertTrue(ESUUID.validate(ESUUID.v7()), "Math.random fallback v7");
    assertEq(fallbackWarnings.length, 1, "Math.random fallback warning is one-time");
    $.global.ESRAND = realRand;
    $.evalFile(esuuidFile);
    assertEq(ESUUID.capabilities().entropy, "ESRAND", "reload upgrades Math.random fallback when ESRAND appears");
    assertTrue(ESUUID !== facadeBeforeReload, "entropy-backend upgrade replaces stale facade");

    // Force a fresh install before loading the minified artifact, otherwise the
    // compatibility-preserving reload path could hide a minifier regression.
    $.global.ESUUID = void 0;
    $.evalFile(esuuidMinFile);
    assertTrue(typeof ESUUID !== "undefined" && ESUUID !== facadeBeforeReload, "minified fresh global loads");
    assertEq(ESUUID.v5("www.example.com", ESUUID.DNS), "2ed6657d-e927-568b-95e1-2665a8aea6a2", "minified RFC v5");
    assertEq(
      ESUUID.v1({msecs:1645557742000,nsecs:0,clockseq:0x33c8,node:[0x9f,0x6b,0xde,0xce,0xd8,0x46],random:zeros()}),
      "c232ab00-9414-11ec-b3c8-9f6bdeced846",
      "minified RFC v1 bitfield"
    );
    assertTrue(ESUUID.validate(ESUUID.v4()), "minified ESRAND-backed v4");

    result = "ESUUID_LIVE_PASS|" + checks + "|Illustrator=" + app.version + "|ExtendScript=" + $.version;
  } finally {
    $.global.__ESUUID_WARN__ = previousWarn;
    $.global.ESUUID = previousUuid;
    $.global.ESRAND = previousRand;
  }

  return result;
}());
