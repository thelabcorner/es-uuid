import {
  load as escharsLoad,
  unload as escharsUnload,
  charCodeAt as escharsCharCodeAt,
  hexEncode as escharsHexEncode
} from '../../../../eschars/src/index';
import {
  trim as esstrTrim,
  clearMemo as esstrClearMemo
} from '../../../../esstr/src/string-core';
import {
  enableNativeGate as esstrEnableNativeGate,
  disableNativeGate as esstrDisableNativeGate
} from '../../../../esstr/src/native-lane';
import {
  map as esarrMap,
  forEach as esarrForEach
} from '../../../../esarr/src/array-core';
import { slice as esarrSlice } from '../../../../esarr/src/array-es3';

var g: any = $.global;
g['__ESUUID_SIBLING_PROTO__'] = {
  escharsLoad: escharsLoad,
  escharsUnload: escharsUnload,
  escharsCharCodeAt: escharsCharCodeAt,
  escharsHexEncode: escharsHexEncode,
  esstrTrim: esstrTrim,
  esstrClearMemo: esstrClearMemo,
  esstrEnableNativeGate: esstrEnableNativeGate,
  esstrDisableNativeGate: esstrDisableNativeGate,
  esarrMap: esarrMap,
  esarrForEach: esarrForEach,
  esarrSlice: esarrSlice
};
