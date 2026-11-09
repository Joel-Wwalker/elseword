/** One policy for the build, local server and deployment verification. */
export function securityHeaders(backend = '') {
  if (backend) {
    const url = new URL(backend);
    if (url.origin !== backend || !['https:', 'http:'].includes(url.protocol) || /[\s;"'<>]/u.test(backend)) throw new Error('Expected a backend origin.');
  }
  const policy = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", "media-src 'self' blob:",
    `connect-src 'self'${backend ? ` ${backend}` : ''}`, "object-src 'none'",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ') + ';';
  return {
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Strict-Transport-Security': 'max-age=31536000',
  };
}

export function protectHTML(html, headers) {
  if (!/<head>/iu.test(html)) throw new Error('HTML needs a head element for its security policy.');
  // frame-ancestors is only honored in HTTP headers. Never imply that the
  // meta fallback provides clickjacking protection on an unconfigured host.
  const policy = headers['Content-Security-Policy'].replace(/frame-ancestors[^;]*;\s*/u, '');
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return html.replace(/<head>/iu, `<head>\n  <meta http-equiv="Content-Security-Policy" content="${escape(policy)}">\n  <meta name="referrer" content="${headers['Referrer-Policy']}">`);
}

export function headersFile(headers) {
  return '/*\n' + Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`).join('\n') + '\n';
}

export function parseHeadersFile(text) {
  return Object.fromEntries(text.split(/\r?\n/u).filter(line => line.startsWith('  ')).map(line => {
    const at = line.indexOf(':');
    if (at < 3) throw new Error('Invalid built header policy. Run npm run build.');
    return [line.slice(2, at), line.slice(at + 1).trim()];
  }));
}
