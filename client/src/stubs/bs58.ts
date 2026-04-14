// Full base58 implementation — same alphabet as Bitcoin/Solana.
// The Crossmint SDK calls bs58.decode at initialization time, so this
// stub must be a real working implementation, not a throw-on-call stub.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58;

const ALPHABET_MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP[ALPHABET[i]] = i;
}

export function encode(bytes: Uint8Array | number[]): string {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (input.length === 0) return "";

  let leadingZeros = 0;
  for (let i = 0; i < input.length && input[i] === 0; i++) leadingZeros++;

  const digits: number[] = [0];
  for (let i = 0; i < input.length; i++) {
    let carry = input[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % BASE;
      carry = (carry / BASE) | 0;
    }
    while (carry > 0) {
      digits.push(carry % BASE);
      carry = (carry / BASE) | 0;
    }
  }

  let result = ALPHABET[0].repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += ALPHABET[digits[i]];
  }
  return result;
}

export function decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let leadingZeros = 0;
  for (let i = 0; i < str.length && str[i] === ALPHABET[0]; i++) leadingZeros++;

  const bytes: number[] = [0];
  for (let i = 0; i < str.length; i++) {
    const value = ALPHABET_MAP[str[i]];
    if (value === undefined) throw new Error(`Non-base58 character: ${str[i]}`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * BASE;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // remove trailing zeros (they were leading zeros in little-endian)
  while (bytes.length > 1 && bytes[bytes.length - 1] === 0) bytes.pop();

  const result = new Uint8Array(leadingZeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + i] = bytes[bytes.length - 1 - i];
  }
  return result;
}

const bs58 = { encode, decode };
export default bs58;
