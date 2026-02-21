const toText = (value: unknown) => String(value ?? '').trim();

const IPV4_WITH_PORT_REGEX = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
const BRACKETED_IPV6_REGEX = /^\[([a-fA-F0-9:.]+)\](?::\d+)?$/;
const IPV6_ZONE_INDEX_REGEX = /%[0-9a-zA-Z_.-]+$/;

export const normalizeIpAddress = (value: unknown): string => {
  let candidate = toText(value).replace(/^"+|"+$/g, '');
  if (!candidate) return '';

  if (candidate.includes(',')) {
    const [first] = candidate.split(',');
    candidate = toText(first);
  }

  const bracketed = candidate.match(BRACKETED_IPV6_REGEX);
  if (bracketed?.[1]) {
    candidate = bracketed[1];
  }

  candidate = candidate.replace(IPV6_ZONE_INDEX_REGEX, '');

  const normalizedLower = candidate.toLowerCase();
  if (normalizedLower.startsWith('::ffff:')) {
    candidate = candidate.slice(7);
  }

  const ipv4WithPort = candidate.match(IPV4_WITH_PORT_REGEX);
  if (ipv4WithPort?.[1]) {
    candidate = ipv4WithPort[1];
  }

  if (candidate.toLowerCase() === 'unknown') {
    return '';
  }

  return toText(candidate);
};

const isValidIpv4 = (value: string) => {
  const parts = value.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const numeric = Number(part);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 255;
  });
};

const isPrivateOrReservedIpv4 = (value: string) => {
  const parts = value.split('.').map((part) => Number(part));
  if (parts.length !== 4) return true;

  const [a, b, c, d] = parts;

  if (a === 0 || a === 127 || a >= 224) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;

  return false;
};

const isValidIpv6 = (value: string) => {
  if (!value.includes(':')) return false;
  return /^[a-fA-F0-9:]+$/.test(value);
};

const isPrivateOrReservedIpv6 = (value: string) => {
  const normalized = value.toLowerCase();
  if (!normalized) return true;
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('2001:db8')) return true;
  return false;
};

export const isPublicIpAddress = (value: unknown): boolean => {
  const normalized = normalizeIpAddress(value);
  if (!normalized) return false;

  if (isValidIpv4(normalized)) {
    return !isPrivateOrReservedIpv4(normalized);
  }

  if (isValidIpv6(normalized)) {
    return !isPrivateOrReservedIpv6(normalized);
  }

  return false;
};

export const pickFirstPublicIpAddress = (candidates: Array<unknown>) => {
  for (const candidate of candidates) {
    const normalized = normalizeIpAddress(candidate);
    if (isPublicIpAddress(normalized)) {
      return normalized;
    }
  }
  return '';
};
