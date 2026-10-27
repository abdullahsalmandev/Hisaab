// "45,000.50" -> 4500050. Empty, invalid, or <= 0 -> null. Integer math only, no floats.
export function toPaisa(input: string): number | null {
  const s = input.replace(/[,\s]/g, '');
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null;
  const [whole = '', frac = ''] = s.split('.');
  const paisa = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(paisa) && paisa > 0 ? paisa : null;
}

// 4500000 -> "Rs 45,000"; 4500050 -> "Rs 45,000.50"; -300000 -> "-Rs 3,000". Pakistani grouping: 12,34,567.
export function formatMoney(paisa: number): string {
  const abs = Math.abs(paisa);
  const rupees = String(Math.floor(abs / 100));
  const p = abs % 100;
  const grouped = rupees.length <= 3
    ? rupees
    : `${rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${rupees.slice(-3)}`;
  const decimals = p ? `.${String(p).padStart(2, '0')}` : '';
  return `${paisa < 0 ? '-' : ''}Rs ${grouped}${decimals}`;
}
