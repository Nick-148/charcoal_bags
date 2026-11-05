// Crockford base32 minus easily-confused characters — order numbers get read aloud and typed into DMs.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newId(): string {
  return crypto.randomUUID();
}

/** Random, non-sequential order number (does not leak sales volume), e.g. "BB-7KQ2MX". */
export function newOrderNumber(prefix: string, length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // 256 % 30 != 0, so reject bytes >= 240 to avoid modulo bias.
  let out = '';
  let i = 0;
  while (out.length < length) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i++]!;
    if (b < 240) out += ALPHABET[b % ALPHABET.length];
  }
  return `${prefix}-${out}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
