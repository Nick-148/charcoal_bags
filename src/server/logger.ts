/**
 * Structured JSON logging for Workers Observability.
 * Rule: never log customer PII (emails, names, addresses, message bodies) — log ids instead.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

function serializeError(error: unknown): Fields {
  if (error instanceof Error) return { error: error.message, errorName: error.name, stack: error.stack };
  return { error: String(error) };
}

function write(level: Level, msg: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, msg, ...fields, ts: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, error?: unknown, fields?: Fields): void;
  child(fields: Fields): Logger;
}

export function createLogger(base: Fields = {}): Logger {
  return {
    debug: (msg, fields) => write('debug', msg, { ...base, ...fields }),
    info: (msg, fields) => write('info', msg, { ...base, ...fields }),
    warn: (msg, fields) => write('warn', msg, { ...base, ...fields }),
    error: (msg, error, fields) =>
      write('error', msg, { ...base, ...fields, ...(error === undefined ? {} : serializeError(error)) }),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}

/** Logger that records entries in memory — for tests. */
export function createMemoryLogger(): Logger & { entries: { level: Level; msg: string; fields: Fields }[] } {
  const entries: { level: Level; msg: string; fields: Fields }[] = [];
  const make = (base: Fields): Logger => ({
    debug: (msg, fields) => entries.push({ level: 'debug', msg, fields: { ...base, ...fields } }),
    info: (msg, fields) => entries.push({ level: 'info', msg, fields: { ...base, ...fields } }),
    warn: (msg, fields) => entries.push({ level: 'warn', msg, fields: { ...base, ...fields } }),
    error: (msg, error, fields) =>
      entries.push({
        level: 'error',
        msg,
        fields: { ...base, ...fields, ...(error === undefined ? {} : serializeError(error)) },
      }),
    child: (fields) => make({ ...base, ...fields }),
  });
  return Object.assign(make({}), { entries });
}
