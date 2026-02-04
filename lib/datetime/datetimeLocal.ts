export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format a Date for an <input type="datetime-local" /> value using LOCAL time.
 * Example: "2026-01-21T14:30"
 */
export function formatDateTimeLocal(value: Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  if (!Number.isFinite(t)) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Parse a <input type="datetime-local" /> value as LOCAL time.
 * Returns null if invalid/empty.
 */
export function parseDateTimeLocal(raw: string | null | undefined): Date | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Accept common datetime-local shapes:
  // - YYYY-MM-DDTHH:mm
  // - YYYY-MM-DDTHH:mm:ss
  // - YYYY-MM-DDTHH:mm:ss.sss
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/);
  if (!m) {
    // Fallback: new Date(s) parses ISO/other formats. Timezone is implementation-dependent
    // (ISO with Z = UTC; without Z = local in most engines). Prefer datetime-local format.
    if (process.env.NODE_ENV === 'development') {
      console.warn('[parseDateTimeLocal] non-standard format, using Date parse (timezone may vary):', s.slice(0, 50));
    }
    const fallback = new Date(s);
    return Number.isFinite(fallback.getTime()) ? fallback : null;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = m[6] ? Number(m[6]) : 0;
  const d = new Date(y, mo - 1, da, hh, mm, Number.isFinite(ss) ? ss : 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function isFutureDateTimeLocalString(raw: string | null | undefined, bufferMs = 60_000): boolean {
  const d = parseDateTimeLocal(raw);
  if (!d) return false;
  return d.getTime() > Date.now() + bufferMs;
}

