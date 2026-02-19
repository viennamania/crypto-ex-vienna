const HEX_COLOR_REGEX = /^#?([0-9a-fA-F]{6})$/;

const BRAND_COLOR_PALETTE = [
  '#0ea5e9',
  '#14b8a6',
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#dc2626',
  '#7c3aed',
  '#0f766e',
];

export const normalizeHexColor = (value: unknown): string => {
  const raw = String(value || '').trim();
  const matched = raw.match(HEX_COLOR_REGEX);
  if (!matched) {
    return '';
  }
  return `#${matched[1].toLowerCase()}`;
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const deriveBrandColorByStorecode = (storecode: string): string => {
  const normalizedStorecode = String(storecode || '').trim().toLowerCase();
  if (!normalizedStorecode) {
    return BRAND_COLOR_PALETTE[0];
  }
  const paletteIndex = hashString(normalizedStorecode) % BRAND_COLOR_PALETTE.length;
  return BRAND_COLOR_PALETTE[paletteIndex];
};

export const resolveStoreBrandColor = (
  storecode: string,
  backgroundColor?: unknown,
): string => {
  const normalizedBackgroundColor = normalizeHexColor(backgroundColor);
  if (normalizedBackgroundColor) {
    return normalizedBackgroundColor;
  }
  return deriveBrandColorByStorecode(storecode);
};

export const rgbaFromHex = (hexColor: string, alpha: number): string => {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) {
    return `rgba(2, 132, 199, ${alpha})`;
  }

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const clampedAlpha = Number.isFinite(alpha)
    ? Math.max(0, Math.min(alpha, 1))
    : 1;

  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};
