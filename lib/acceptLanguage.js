/*
 * Build an Accept-Language header value from Google's `hl` (interface language)
 * and `gl` (country) parameters.
 *
 * Examples:
 *   hl=en, gl=us  -> "en-US,en;q=0.9"
 *   hl=es, gl=mx  -> "es-MX,es;q=0.9"
 *   hl=zh-CN      -> "zh-CN,zh;q=0.9"
 */

export function buildAcceptLanguage(hl, gl) {
  const lang = (hl || 'en').trim();
  const region = (gl || '').trim().toUpperCase();

  if (!lang) return 'en-US,en;q=0.9';

  const primary = lang.includes('-')
    ? lang
    : region
    ? `${lang}-${region}`
    : lang;

  const base = lang.split('-')[0];

  if (primary === base) {
    return `${primary};q=1.0`;
  }
  return `${primary},${base};q=0.9`;
}
