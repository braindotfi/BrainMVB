const notAvailable = (name: string) => () => {
  throw new Error(`tweetnacl.${name} is not available in this build (Solana not supported)`);
};

const nacl = {
  randomBytes(n: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(n));
  },
  secretbox: {
    keyLength: 32,
    nonceLength: 24,
    overheadLength: 16,
    before: notAvailable("secretbox.before"),
    open: notAvailable("secretbox.open"),
  },
  secretbox_open: notAvailable("secretbox_open"),
  scalarMult: {
    groupElementLength: 32,
    scalarLength: 32,
    base: notAvailable("scalarMult.base"),
  },
  box: {
    keyPairLength: 64,
    publicKeyLength: 32,
    secretKeyLength: 32,
    sharedKeyLength: 32,
    nonceLength: 24,
    overheadLength: 16,
    keyPair: notAvailable("box.keyPair"),
    keyPairFromSecretKey: notAvailable("box.keyPairFromSecretKey"),
    before: notAvailable("box.before"),
    open: notAvailable("box.open"),
  },
  sign: {
    publicKeyLength: 32,
    secretKeyLength: 64,
    seedLength: 32,
    signatureLength: 64,
    keyPair: notAvailable("sign.keyPair"),
    keyPairFromSeed: notAvailable("sign.keyPairFromSeed"),
    keyPairFromSecretKey: notAvailable("sign.keyPairFromSecretKey"),
    detached: Object.assign(notAvailable("sign.detached"), {
      verify: notAvailable("sign.detached.verify"),
    }),
    open: notAvailable("sign.open"),
  },
  hash: notAvailable("hash"),
  verify: notAvailable("verify"),
  setPRNG: notAvailable("setPRNG"),
};

export default nacl;
