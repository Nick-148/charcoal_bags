export const NO_STORE = 'no-store';

export function json(data: unknown, init: ResponseInit & { status?: number } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', NO_STORE);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, { status });
}

/** Reads a JSON body with a hard size cap. Returns undefined on malformed / oversized input. */
export async function readJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) return undefined;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return undefined;
  const text = await request.text();
  if (text.length > maxBytes) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 303 redirect for the POST → redirect → GET pattern used by HTML forms. */
export function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': NO_STORE } });
}
