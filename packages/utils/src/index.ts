/**
 * @rentbrown/utils — platform-neutral DISPLAY helpers (web + React Native).
 *
 * Nothing here is financial business logic. These functions format values the
 * backend already decided. Keep them pure and free of DOM / RN imports.
 */

import type { BasisPoints, CurrencyCode, Duration, ISODateString, MinorUnits } from "@rentbrown/types";

// ── Money ────────────────────────────────────────────────────────────────────

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { NGN: "₦", USD: "$" };
export const MINOR_UNIT_SCALE: Record<CurrencyCode, number> = { NGN: 100, USD: 100 };

export interface FormatMoneyOptions {
  /** Show decimals even when the amount is whole. Default: only when non-zero. */
  decimals?: "auto" | "always" | "never";
  /** Prefix "+" / "−" based on sign. Default false (absolute value shown). */
  signed?: boolean;
  /** Abbreviate large numbers: ₦1.2M. Use only in dense charts/labels, never for balances. */
  compact?: boolean;
  /** Omit the currency symbol. */
  symbol?: boolean;
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 10000000 NGN kobo → "₦100,000"; 1234550 → "₦12,345.50". */
export function formatMoney(
  minor: MinorUnits,
  currency: CurrencyCode = "NGN",
  opts: FormatMoneyOptions = {},
): string {
  const { decimals = "auto", signed = false, compact = false, symbol = true } = opts;
  const scale = MINOR_UNIT_SCALE[currency];
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const sym = symbol ? CURRENCY_SYMBOL[currency] : "";
  const sign = signed ? (negative ? "−" : "+") : negative ? "−" : "";

  if (compact) {
    const major = abs / scale;
    const units: Array<[number, string]> = [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ];
    for (const [div, suffix] of units) {
      if (major >= div) {
        const v = major / div;
        return `${sign}${sym}${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}${suffix}`;
      }
    }
    return `${sign}${sym}${groupThousands(String(Math.round(major)))}`;
  }

  const int = Math.floor(abs / scale);
  const frac = abs % scale;
  const showFrac = decimals === "always" || (decimals === "auto" && frac !== 0);
  const fracStr = showFrac ? `.${String(frac).padStart(2, "0")}` : "";
  return `${sign}${sym}${groupThousands(String(int))}${fracStr}`;
}

/** Signed variant for transaction rows: "+₦250,000" / "−₦25,000". */
export function formatMoneySigned(minor: MinorUnits, currency: CurrencyCode = "NGN"): string {
  return formatMoney(minor, currency, { signed: true });
}

/** Split for typographic emphasis: { symbol: "₦", whole: "146,250", fraction: ".00" | "" }. */
export function splitMoney(
  minor: MinorUnits,
  currency: CurrencyCode = "NGN",
  decimals: FormatMoneyOptions["decimals"] = "auto",
) {
  const formatted = formatMoney(minor, currency, { decimals, symbol: false });
  const [whole = "", frac] = formatted.split(".");
  return { symbol: CURRENCY_SYMBOL[currency], whole, fraction: frac ? `.${frac}` : "" };
}

/** Parse "150,000" or "150000.50" (major units) into minor units. Returns null if invalid. */
export function parseMajorToMinor(input: string, currency: CurrencyCode = "NGN"): MinorUnits | null {
  const cleaned = input.replace(/[,\s₦$]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = "0", frac = ""] = cleaned.split(".");
  const scale = MINOR_UNIT_SCALE[currency];
  return Number(whole) * scale + Number((frac + "00").slice(0, 2));
}

/** Convert whole major units to minor (mock fixtures only): naira(100_000) → 10_000_000. */
export function naira(major: number): MinorUnits {
  return Math.round(major * 100);
}

// ── Rates ────────────────────────────────────────────────────────────────────

/** 1650 → "16.5%"; 1400 → "14%"; 1250 → "12.5%". */
export function formatBps(bps: BasisPoints, opts: { trim?: boolean } = {}): string {
  const { trim = true } = opts;
  const pct = bps / 100;
  const str = pct.toFixed(2);
  return `${trim ? str.replace(/\.?0+$/, "") : str}%`;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** "30 Sep 2027" (medium) | "30 September 2027" (long) | "30/09/2027" (numeric). */
export function formatDate(iso: ISODateString, style: "medium" | "long" | "numeric" = "medium"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const y = d.getFullYear();
  if (style === "numeric") return `${pad2(day)}/${pad2(d.getMonth() + 1)}/${y}`;
  if (style === "long") return `${day} ${MONTHS_LONG[d.getMonth()]} ${y}`;
  return `${day} ${MONTHS_SHORT[d.getMonth()]} ${y}`;
}

/** "30 Sep 2027, 16:42". */
export function formatDateTime(iso: ISODateString): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(iso)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "Thursday, 24 September" — used for dashboard greetings. */
export function formatDayHeading(iso: ISODateString): string {
  const d = new Date(iso);
  return `${DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

export function daysBetween(fromIso: ISODateString, toIso: ISODateString): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** "in 38 days" | "38 days ago" | "today" | "tomorrow" | "yesterday". */
export function formatRelativeDays(iso: ISODateString, nowIso: ISODateString): string {
  const days = daysBetween(nowIso, iso);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

/** Short relative label for lists: "Today" | "Yesterday" | "11 Sep". */
export function formatListDate(iso: ISODateString, nowIso: ISODateString): string {
  const days = daysBetween(iso.slice(0, 10), nowIso.slice(0, 10));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** { value: 12, unit: "MONTHS" } → "12 months"; { value: 1, unit: "MONTHS" } → "1 month". */
export function formatDuration(duration: Duration): string {
  const unit = duration.unit.toLowerCase();
  const singular = unit.slice(0, -1);
  return `${duration.value} ${duration.value === 1 ? singular : unit}`;
}

/** Compact duration for chips: "12 mo" | "6 mo" | "8 hrs" | "2 wks". */
export function formatDurationShort(duration: Duration): string {
  const map: Record<Duration["unit"], string> = { HOURS: "hrs", DAYS: "days", WEEKS: "wks", MONTHS: "mo", YEARS: "yr" };
  return `${duration.value} ${map[duration.unit]}`;
}

/** Days remaining → "38 days" | "1 day" | "Matured". */
export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "—";
  if (days <= 0) return "Matured";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

// ── Strings ──────────────────────────────────────────────────────────────────

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** "0123456789" → "•••• 6789". */
export function maskAccountNumber(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`;
}

/** Locked status vocabulary → human label. "NEARING_CAPACITY" → "Nearing capacity". */
export function humanizeStatus(status: string): string {
  const s = status.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Build a pluralised count label: pluralize(3, "investment") → "3 investments". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Client-side idempotency key for mutations (never a security token). */
export function idempotencyKey(prefix = "rb"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

/**
 * Normalize an env-provided origin ("https://x.com", "x.com", undefined) into
 * a valid absolute URL for `new URL()` / metadata / sitemap use.
 *
 * Bare hosts get `https://`; anything still unparseable falls back. Never
 * throws — env URLs are evaluated at module scope during Next.js page-data
 * collection, where a throw surfaces as an opaque build failure.
 */
export function absoluteUrl(value: string | undefined | null, fallback: string): string {
  const raw = (value ?? "").trim();
  const candidate = raw === "" ? fallback : /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.origin;
  } catch {
    return new URL(fallback).origin;
  }
}

export * from "./status";
