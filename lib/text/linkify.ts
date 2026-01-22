export type LinkToken =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const URL_RE = /((https?:\/\/|www\.)[^\s<>"']+)/gi;

export function extractUrls(text: string, limit: number = 5): string[] {
  const s = String(text || '');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE);
  while ((m = re.exec(s)) && out.length < limit) {
    out.push(m[1]);
  }
  return out;
}

export function linkify(text: string): LinkToken[] {
  const s = String(text || '');
  if (!s) return [{ type: 'text', value: '' }];

  const tokens: LinkToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_RE);

  while ((m = re.exec(s))) {
    const raw = m[1];
    const start = m.index;
    const end = start + raw.length;
    if (start > last) tokens.push({ type: 'text', value: s.slice(last, start) });

    const href = raw.startsWith('http://') || raw.startsWith('https://') ? raw : raw.startsWith('www.') ? `https://${raw}` : raw;
    tokens.push({ type: 'link', value: raw, href });
    last = end;
  }

  if (last < s.length) tokens.push({ type: 'text', value: s.slice(last) });
  return tokens;
}

