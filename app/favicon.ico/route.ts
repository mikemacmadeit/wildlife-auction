/**
 * Browsers request /favicon.ico by default.
 * We don't commit a binary .ico into the repo, so we redirect to a text-based SVG.
 */
export function GET(request: Request) {
  const url = new URL('/favicon.svg', request.url);
  return Response.redirect(url, 307);
}

export function HEAD(request: Request) {
  const url = new URL('/favicon.svg', request.url);
  return Response.redirect(url, 307);
}

