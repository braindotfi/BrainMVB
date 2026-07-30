/**
 * The ONE currency-in-prose formatter.
 *
 * Backend text (LLM replies, brain-core proposal narratives, insight explanations,
 * audit summaries, citation excerpts) arrives with amounts in whatever shape the
 * producer felt like emitting: "$42000.00", "USD 18600.00000000", "48000.00 USD".
 * Every surface that renders such text must run it through here so the user sees
 * "$42,000.00" everywhere.
 *
 * This replaces two diverged private copies (one in BrainAssistant, one in HomePage)
 * that each handled a DIFFERENT subset — the assistant's matched a "USD 18600"
 * prefix but not a "48000.00 USD" suffix and never applied the FX rate, HomePage's
 * was the exact reverse. An amount formatted correctly on one screen was therefore
 * raw or unconverted on another. Do not re-inline this; extend it and its tests.
 *
 * Deliberately NOT handled: bare numbers with no currency marker. "42000.00" is
 * indistinguishable from a date part, a count, a confidence score or an id fragment,
 * so guessing would corrupt text that is already correct. Producers must emit a
 * marker — see the amount helpers in server/routes.ts.
 */

/** Amount-bearing text is USD unless explicitly marked otherwise: USD is the
 *  canonical source currency for ledger data (see currencyContext USD_RATES). */
type Marker = "usd" | "eur" | "other";

function markerFor(token: string): Marker {
  const t = token.toLowerCase();
  if (t === "$" || t === "usd") return "usd";
  if (t === "€" || t === "eur") return "eur";
  return "other";
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Group separators + 2dp, WITHOUT applying an FX rate. */
function normalizeOnly(value: number, symbol: string, sign: string): string {
  return `${sign}${symbol}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface AmountTextOptions {
  /** useCurrency().format — converts a USD amount into the active currency. */
  format: (amount: string | number) => string;
  /** useCurrency().symbol — the active currency's symbol. */
  symbol: string;
}

export function formatAmountsInText(text: string, opts: AmountTextOptions): string {
  if (!text) return text;
  const { format, symbol } = opts;

  const render = (marker: Marker, value: number, sign: string): string => {
    // An amount already marked in the ACTIVE currency has been converted once
    // already; converting again would silently apply the rate twice.
    if (marker === "eur" && symbol === "€") return normalizeOnly(value, symbol, sign);
    const formatted = format(value);
    return sign && !formatted.startsWith(sign) ? `${sign}${formatted}` : formatted;
  };

  // ETH first: native units, never FX-converted and never given a fiat symbol.
  // Runs before the fiat passes so "ETH 1.5" can't be mistaken for a bare amount.
  let out = text.replace(/\bETH\s+(\d[\d,]*(?:\.\d+)?)/gi, (m, raw: string) => {
    const num = toNumber(raw);
    if (num === null) return m;
    return `ETH ${num.toLocaleString("en-US", {
      minimumFractionDigits: raw.includes(".") ? 2 : 0,
      maximumFractionDigits: 8,
    })}`;
  });

  // 1. Symbol-prefixed: "$1234.56", "-€2,400", "+$99"
  out = out.replace(
    /([+-])?([$€])[ \t]*(\d[\d,]*(?:\.\d+)?)/g,
    (m, sign: string | undefined, sym: string, raw: string) => {
      const num = toNumber(raw);
      if (num === null) return m;
      return render(markerFor(sym), num, sign?.trim() === "-" ? "-" : "");
    },
  );

  // 2. Code-prefixed: "USD 18600.00000000" (the ledger/citation excerpt shape).
  out = out.replace(
    /([+-])?\b(USD|EUR)[ \t]+(\d[\d,]*(?:\.\d+)?)/gi,
    (m, sign: string | undefined, code: string, raw: string) => {
      const num = toNumber(raw);
      if (num === null) return m;
      return render(markerFor(code), num, sign?.trim() === "-" ? "-" : "");
    },
  );

  // 3. Code-suffixed: "48000.00 USD" (the insight/summary shape).
  out = out.replace(
    /([+-])?(\d[\d,]*(?:\.\d+)?)[ \t]+(USD|EUR)\b/gi,
    (m, sign: string | undefined, raw: string, code: string) => {
      const num = toNumber(raw);
      if (num === null) return m;
      return render(markerFor(code), num, sign?.trim() === "-" ? "-" : "");
    },
  );

  return out;
}
