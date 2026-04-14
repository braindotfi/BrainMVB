function decode(_str: string): Uint8Array {
  throw new Error("bs58.decode is not available in this build (Solana not supported)");
}

function encode(_bytes: Uint8Array): string {
  throw new Error("bs58.encode is not available in this build (Solana not supported)");
}

const bs58 = { decode, encode };
export default bs58;
export { decode, encode };
