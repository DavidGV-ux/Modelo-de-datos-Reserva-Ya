export const DEFAULT_BRAND_COLOR = '#2e7d32';

export function normalizeBrandColor(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : null;
}

export function contrastColor(hex: string | null | undefined): string {
  const normalized = normalizeBrandColor(hex) ?? DEFAULT_BRAND_COLOR;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}
