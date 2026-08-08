const sensitiveKey = /authorization|api[_-]?key|token|signed|url|email|document|body|password|secret|cookie|credential/i;

export function sanitizeLogContext(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return "[REDACTED]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 160 ? `${value.slice(0, 160)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogContext(item));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([entryKey, entryValue]) => [entryKey, sanitizeLogContext(entryValue, entryKey)]));
  }
  return String(value);
}
