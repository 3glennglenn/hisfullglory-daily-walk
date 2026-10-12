export function safeSourceUrl(value: string): string | null {
  if (!/^https:\/\/[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+(\/[^\s\\]*)?$/.test(value) || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || /\.(local|localhost|internal)$/i.test(url.hostname)) return null;
    return value;
  } catch { return null; }
}
