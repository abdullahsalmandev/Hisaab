const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

// ISO -> "25 Oct 2026" in local time. Manual, Hermes Intl locale support varies.
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Date -> "2026-10-25" in local time.
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-10-25" -> ISO at that local day plus the current time of day (keeps same-day entries ordered). Invalid -> null.
export function parseDateInput(s: string, now = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  const real = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  return real ? date.toISOString() : null;
}

// 4500050 -> "45000.50", 4500000 -> "45000". Integer math, round-trips through toPaisa.
export function paisaToInput(paisa: number): string {
  const p = paisa % 100;
  return `${Math.floor(paisa / 100)}${p ? `.${pad(p)}` : ''}`;
}
