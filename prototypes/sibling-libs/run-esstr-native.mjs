#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_ROOT,
  SCRIPTS_ROOT,
  acquireLeaseWithRetry,
  discoverIllustratorTarget,
  parseCommonOptions,
  releaseLease,
  resultValue,
  runFile,
  sha256File
} from '../../tooling/comtool-v2.mjs';

var HERE = dirname(fileURLToPath(import.meta.url));
var config = parseCommonOptions(process.argv.slice(2));
var estc = join(PROJECT_ROOT, 'node_modules', 'extendscript-toolchain', 'bin', 'estc.mjs');
var protoConfig = join(HERE, 'estc.config.mjs');
var proto = join(HERE, 'dist', 'sibling-prototype.jsx');
var probe = join(HERE, 'esstr-native-probe.jsx');
var estimer = join(SCRIPTS_ROOT, 'estimer', 'dist', 'vendor-estimer.js');
var esuuid = join(PROJECT_ROOT, 'dist', 'vendor-esuuid.js');
var dll = join(SCRIPTS_ROOT, 'esstr', 'native', 'bin', 'ESSTRTrim.dll');
var runSession = 'esstr-' + process.pid + '-' + Date.now().toString(36);
var runLock = join(HERE, '.microbench.lock');

function need(p,label){ if(!existsSync(p)) throw new Error(label + ' missing: ' + p); }
function sha(p){ return createHash('sha256').update(readFileSync(p)).digest('hex'); }
function pidAlive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch (_) { return false; }
}
function acquireRunLock() {
  for (;;) {
    try {
      var fd = openSync(runLock, 'wx');
      writeFileSync(fd, JSON.stringify({pid:process.pid,runSession:runSession})+'\n', 'utf8');
      closeSync(fd);
      return;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      var owner = null;
      try { owner = JSON.parse(readFileSync(runLock, 'utf8')); } catch (_) {}
      if (!owner || !pidAlive(Number(owner.pid))) {
        try { unlinkSync(runLock); } catch (_) {}
        continue;
      }
      throw new Error('another sibling microbenchmark is already running: pid=' + owner.pid + ' session=' + owner.runSession);
    }
  }
}
function releaseRunLock() {
  try {
    var owner = JSON.parse(readFileSync(runLock, 'utf8'));
    if (Number(owner.pid) === process.pid) unlinkSync(runLock);
  } catch (_) {}
}

for (var x of [[estc,'ESTC'],[protoConfig,'prototype config'],[probe,'probe'],[estimer,'ESTIMER'],[esuuid,'ESUUID'],[dll,'ESSTRTrim.dll']]) need(x[0],x[1]);

acquireRunLock();
process.on('exit', releaseRunLock);

execFileSync(process.execPath,[estc,'build','--config',protoConfig],{cwd:PROJECT_ROOT,stdio:'inherit',timeout:300000});
need(proto,'compiled prototype');

var targetEntry = discoverIllustratorTarget(config);
var targetId = targetEntry.target.id;
var leaseId = null;
var envelope;
try {
  leaseId = acquireLeaseWithRetry(config,targetId,120000);
  envelope = runFile(config,{
    leaseId,
    requestId:'esuuid-esstr-native-' + runSession,
    path:probe,
    sha256:sha256File(probe),
    targetId,
    args:[estimer,esuuid,proto,dll],
    timeoutMs:90000
  });
} finally {
  if(leaseId) releaseLease(config,targetId,leaseId);
}

var value = resultValue(envelope);
if(typeof value !== 'string') throw new Error('non-string result');
var m=/^ESSTR_NATIVE\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|(\d+)\|(\d+)\|Illustrator=([^|]+)\|ExtendScript=(.+)$/.exec(value);
if(!m) throw new Error('malformed result: ' + value);

function stats(start){
  return {
    medianUs:Number(m[start]),
    minUs:Number(m[start+1]),
    p95Us:Number(m[start+2]),
    count:Number(m[start+3]),
    rejected:Number(m[start+4])
  };
}
var baseline=stats(1), pure=stats(6), nativeLane=stats(11);
var evidence={
  schemaVersion:1,
  kind:'esuuid-esstr-native-microprototype',
  capturedAt:new Date().toISOString(),
  runSession,
  transport:'COM Tool V2 script.runFile',
  target:{id:targetId,hostVersion:targetEntry.identity&&targetEntry.identity.hostVersion,processId:targetEntry.identity&&targetEntry.identity.processId},
  hashes:{
    runner:sha(fileURLToPath(import.meta.url)),
    probe:sha(probe),
    estcConfig:sha(protoConfig),
    prototypeBundle:sha(proto),
    esstrTrimDll:sha(dll),
    esstrStringCore:sha(join(SCRIPTS_ROOT,'esstr','src','string-core.ts')),
    esstrNativeLane:sha(join(SCRIPTS_ROOT,'esstr','src','native-lane.ts')),
    esuuidVendor:sha(esuuid),
    estimerVendor:sha(estimer)
  },
  workload:'64 rotating UUID validate operations per timed sample; ESSTR native minLength forced to 0',
  baseline,
  pure,
  native:nativeLane,
  pureOverBaseline:pure.medianUs/baseline.medianUs,
  nativeOverBaseline:nativeLane.medianUs/baseline.medianUs,
  nativeOverPure:nativeLane.medianUs/pure.medianUs,
  illustrator:m[16],
  extendScript:m[17]
};
var dir=join(HERE,'evidence');
mkdirSync(dir,{recursive:true});
var text=JSON.stringify(evidence,null,2)+'\n';
var evidencePath=join(dir,'native-run-' + runSession + '.json');
var latestPath=join(dir,'esstr-native.json');
var latestTmp=latestPath+'.tmp-'+runSession;
writeFileSync(evidencePath,text);
writeFileSync(latestTmp,text);
renameSync(latestTmp,latestPath);
console.log('ESSTR native UUID-size trim prototype');
console.log('direct validate : ' + baseline.medianUs.toFixed(1) + ' us / 64');
console.log('ESSTR pure trim : ' + pure.medianUs.toFixed(1) + ' us / 64 (' + evidence.pureOverBaseline.toFixed(2) + 'x baseline)');
console.log('ESSTR native    : ' + nativeLane.medianUs.toFixed(1) + ' us / 64 (' + evidence.nativeOverBaseline.toFixed(2) + 'x baseline; ' + evidence.nativeOverPure.toFixed(2) + 'x pure)');
console.log('evidence        : ' + evidencePath);
