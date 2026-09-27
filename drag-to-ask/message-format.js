// The conversation model: what a message with attachments looks like as text,
// and how replies point back at the page. No DOM, no network.
//
// Stand's Visitor API sends text. An attachment is one line at the top of the
// visitor's message, readable as is by the team in Stand:
//
//   📎 Pricing.sheet › Session replay (5,000 recordings free/mo, then $0.005 each)
//   📎 Changelog.txt › 2026-09-08 (Session replay: heatmaps on top of recordings)
//   Do heatmaps count as extra recordings?
//
// Replies name parts of the page in double square brackets, [[Pricing.sheet:
// Session replay]], and the page turns those into chips that open windows.

export const MARK = '📎';
export const SEP = ' › ';
export const MAX_ATTACHMENTS = 4;

const LIMITS = { source: 40, item: 80, value: 120 };

// One line, no brackets that would confuse the parser, and a sane length.
function clean(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').replace(/[\[\]]/g, '').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** { source, item, value } → a tidy attachment with only the fields that matter. */
export function attachment({ source = '', item = '', value = '' } = {}) {
  return {
    source: clean(source, LIMITS.source).replaceAll('›', '-'),
    item: clean(item, LIMITS.item).replaceAll('›', '-'),
    value: clean(value, LIMITS.value),
  };
}

export function attachmentLabel({ source, item }) {
  return [source, item].filter(Boolean).join(SEP);
}

export function attachmentLine(a) {
  const { source, item, value } = attachment(a);
  return `${MARK} ${attachmentLabel({ source, item })}${value ? ` (${value})` : ''}`;
}

export function sameAttachment(a, b) {
  return a.source === b.source && a.item === b.item;
}

export function formatMessage({ attachments = [], text = '' } = {}) {
  return [...attachments.map(attachmentLine), String(text).trim()].filter(Boolean).join('\n');
}

/**
 * Splits a message into its attachments and the question. Lines that start with
 * the marker are attachments wherever they are, so a draft that the client
 * merged with another one after a failed start still comes back as chips.
 */
export function parseMessage(body = '') {
  const attachments = [];
  const text = [];
  for (const line of String(body).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${MARK} `) || trimmed === MARK) {
      const parsed = parseAttachment(trimmed);
      if (parsed && !attachments.some((a) => sameAttachment(a, parsed))) attachments.push(parsed);
    } else {
      text.push(line);
    }
  }
  return { attachments, text: text.join('\n').replace(/^\n+|\n+$/g, '').trim() };
}

// "📎 Source › Item (value)" → { source, item, value }. The value is the last
// balanced parenthesis at the end of the line, so values may contain their own.
export function parseAttachment(line) {
  let rest = line.slice(MARK.length).trim();
  if (!rest) return null;
  let value = '';
  if (rest.endsWith(')')) {
    let depth = 0;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i] === ')') depth++;
      else if (rest[i] === '(' && --depth === 0) {
        if (i > 0) {
          value = rest.slice(i + 1, -1).trim();
          rest = rest.slice(0, i).trim();
        }
        break;
      }
    }
  }
  const at = rest.indexOf('›');
  const source = (at === -1 ? rest : rest.slice(0, at)).trim();
  const item = at === -1 ? '' : rest.slice(at + 1).trim();
  return source ? { source, item, value } : null;
}

// References ------------------------------------------------------------------

const REF = /\[\[([^\]\n]{1,80})\]\]/g;

/** Reply text → [{ text }, { ref }, { text }…]. Refs are names, not targets yet. */
export function parseReply(body = '') {
  const parts = [];
  let last = 0;
  for (const match of String(body).matchAll(REF)) {
    if (match.index > last) parts.push({ text: body.slice(last, match.index) });
    parts.push({ ref: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

/** For matching names: case, spacing, trailing punctuation and file extensions don't matter. */
export function normalizeName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[“”"'‘’]/g, '')
    .replace(/\.(sheet|txt|doc|md|app)\b/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?)]+$/, '')
    .trim();
}

/** "Pricing.sheet: Session replay" or "Pricing.sheet › Session replay" → [window, item]. */
export function splitRef(name = '') {
  const at = name.search(/[:›]/);
  return at === -1 ? [name.trim(), ''] : [name.slice(0, at).trim(), name.slice(at + 1).trim()];
}
