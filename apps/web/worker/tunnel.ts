/* The error report tunnel. Content blockers stop requests to Sentry's own domain, so the app sends its reports to
   /tunnel on its own site and they are passed on from here. Only reports for this app's project (SENTRY_DSN, set
   at deploy) are forwarded, and the sender's address is not. */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SENTRY_DSN?: string;
}

const NEWLINE = 10;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Anything else is the site's (and its not-found page)
    if (new URL(request.url).pathname !== '/tunnel' || !env.SENTRY_DSN) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });

    const own = new URL(env.SENTRY_DSN);
    const body = new Uint8Array(await request.arrayBuffer());
    // An envelope starts with a line of JSON naming the DSN it's for
    const end = body.indexOf(NEWLINE);
    let dsn: URL;
    try {
      dsn = new URL((JSON.parse(new TextDecoder().decode(end < 0 ? body : body.subarray(0, end))) as { dsn: string }).dsn);
    } catch {
      return new Response('Not an envelope', { status: 400 });
    }
    if (dsn.host !== own.host || dsn.pathname !== own.pathname) return new Response('Unknown project', { status: 403 });

    const res = await fetch(`https://${own.host}/api${own.pathname}/envelope/`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body
    });
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain' } });
  }
};
