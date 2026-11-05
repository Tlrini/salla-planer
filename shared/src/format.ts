/** Group the integer part with dots: 1250 -> "1.250". */
function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatNumber(value: number, decimals: number): string {
  const sign = value < 0 ? '-' : '';
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart = '0', frac] = fixed.split('.');
  const grouped = groupThousands(intPart);
  return sign + (frac ? `${grouped},${frac}` : grouped);
}

/** 1250 -> "1.250,00 €" */
export function formatEUR(value: number): string {
  return `${formatNumber(value, 2)} €`;
}

/** 12.5 -> "12,5 m"; decimals defaults to 1. */
export function formatMeters(value: number, decimals = 1): string {
  return `${formatNumber(value, decimals)} m`;
}

/** Plain number with comma decimals, no unit: 0.45 -> "0,45". */
export function formatDecimal(value: number, decimals = 2): string {
  return formatNumber(value, decimals);
}

/** "2026-06-14" (or a full ISO timestamp) -> "14.06.2026". */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** ISO timestamp -> "14.06.2026 21:14" in local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
