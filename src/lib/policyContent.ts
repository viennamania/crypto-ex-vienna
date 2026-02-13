export type PolicyContent = string[] | string | undefined;

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'div',
  'span',
  'pre',
  'code',
]);

const BLOCKED_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'math',
  'form',
  'input',
  'textarea',
  'button',
  'select',
  'option',
  'link',
  'meta',
  'base',
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeLink = (value: string) => {
  const nextValue = value.trim();
  if (!nextValue) return '#';

  const lowerValue = nextValue.toLowerCase();
  if (lowerValue.startsWith('javascript:') || lowerValue.startsWith('data:')) {
    return '#';
  }

  if (
    lowerValue.startsWith('http://')
    || lowerValue.startsWith('https://')
    || lowerValue.startsWith('mailto:')
    || lowerValue.startsWith('tel:')
    || nextValue.startsWith('/')
    || nextValue.startsWith('#')
  ) {
    return nextValue;
  }

  return `https://${nextValue}`;
};

const plainTextToHtml = (value: string) => {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const linesToHtml = (lines: string[]) =>
  lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

export const sanitizePolicyHtml = (value: string) => {
  let html = value || '';

  html = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const tag of BLOCKED_TAGS) {
    const blockPattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    const singlePattern = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    html = html.replace(blockPattern, '');
    html = html.replace(singlePattern, '');
  }

  html = html
    .replace(/\s+on[a-z-]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');

  html = html.replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi, (_match, closingSlash, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }

    const isClosing = Boolean(closingSlash);
    if (isClosing) {
      return `</${tag}>`;
    }

    if (tag === 'br') {
      return '<br>';
    }

    if (tag === 'a') {
      const attrs = String(rawAttrs || '');
      const hrefMatch = attrs.match(/\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`<>]+))/i);
      const targetMatch = attrs.match(/\btarget\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`<>]+))/i);
      const rawHref = hrefMatch ? (hrefMatch[2] || hrefMatch[3] || hrefMatch[4] || '') : '';
      const rawTarget = targetMatch ? (targetMatch[2] || targetMatch[3] || targetMatch[4] || '') : '';
      const href = escapeHtml(normalizeLink(rawHref));
      const target = rawTarget === '_self' ? '_self' : '_blank';
      const rel = target === '_blank' ? 'noopener noreferrer' : 'noopener';

      return `<a href="${href}" target="${target}" rel="${rel}">`;
    }

    return `<${tag}>`;
  });

  return html.trim();
};

export const normalizePolicyContentToHtml = (value?: PolicyContent) => {
  if (Array.isArray(value)) {
    return linesToHtml(value);
  }

  const content = String(value || '').trim();
  if (!content) {
    return '';
  }

  if (HTML_TAG_PATTERN.test(content)) {
    return sanitizePolicyHtml(content);
  }

  return plainTextToHtml(content);
};

export const hasMeaningfulPolicyContent = (value?: PolicyContent) => {
  const html = normalizePolicyContentToHtml(value);
  if (!html) return false;

  const plainText = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plainText.length > 0;
};
