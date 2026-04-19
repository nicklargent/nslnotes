/**
 * True if the href points outside the notebook — an absolute URL with a
 * scheme (http, https, mailto, ftp, tel, etc.) or a protocol-relative URL.
 */
export function isExternalUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}
