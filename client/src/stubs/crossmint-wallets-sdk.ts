export class WalletNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletNotAvailableError";
  }
}

export class CrossmintWallets {
  static from(_opts: any): CrossmintWallets {
    return new CrossmintWallets();
  }
  getOrCreate(_opts: any): Promise<any> {
    return Promise.reject(new WalletNotAvailableError("CrossmintWallets not available in this build"));
  }
}

export class EVMWallet {
  address: string = "";
  chain: string = "";
}

export class SolanaWallet {
  address: string = "";
  chain: string = "";
}

export class StellarWallet {
  address: string = "";
  chain: string = "";
}

export class Wallet {
  address: string = "";
  chain: string = "";
}

export function isExportableSignerAdapter(_adapter: any): boolean {
  return false;
}

export class IframeDeviceSignerKeyStorage {
  getKeys(): Promise<any[]> {
    return Promise.resolve([]);
  }
}
