export type ByteArrayLike = ArrayLike<number>;
export type RandomBytesFn = () => ByteArrayLike;

export interface RandomOptions {
  random?: ByteArrayLike;
  rng?: RandomBytesFn;
}

export interface V1Options extends RandomOptions {
  node?: ByteArrayLike;
  clockseq?: number;
  msecs?: number;
  nsecs?: number;
}

export interface V7Options extends RandomOptions {
  msecs?: number;
  seq?: number;
}

export interface FactoryOptions {
  rng?: RandomBytesFn;
  rand?: { bytes(count: number): number[] };
  now?: () => number;
}

export interface UUIDGenerator {
  v1(options?: V1Options, buffer?: number[], offset?: number): string | number[];
  v4(options?: RandomOptions, buffer?: number[], offset?: number): string | number[];
  v6(options?: V1Options, buffer?: number[], offset?: number): string | number[];
  v7(options?: V7Options, buffer?: number[], offset?: number): string | number[];
}

export interface UUIDFacade extends UUIDGenerator {
  VERSION: string;
  NIL: string;
  MAX: string;
  DNS: string;
  URL: string;
  OID: string;
  X500: string;
  parse(uuid: string): number[];
  stringify(bytes: ByteArrayLike, offset?: number): string;
  validate(uuid: string): boolean;
  version(uuid: string): number;
  v3(value: string | ByteArrayLike, namespace: string | ByteArrayLike, buffer?: number[], offset?: number): string | number[];
  v5(value: string | ByteArrayLike, namespace: string | ByteArrayLike, buffer?: number[], offset?: number): string | number[];
  v1ToV6(uuid: string): string;
  v6ToV1(uuid: string): string;
  create(options?: FactoryOptions): UUIDGenerator;
  capabilities(): {
    standard: string;
    engine: string;
    entropy: string;
    cryptographic: boolean;
  };
}
