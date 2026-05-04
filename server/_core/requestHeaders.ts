export function getHeaderValue(
  req: { header?: (name: string) => string | undefined; headers?: Record<string, unknown> },
  name: string
): string | undefined {
  if (typeof req?.header === "function") {
    return req.header(name);
  }

  const headers = req?.headers ?? {};
  const lowerName = name.toLowerCase();
  const direct = headers[lowerName] ?? headers[name];

  if (Array.isArray(direct)) {
    return typeof direct[0] === "string" ? direct[0] : undefined;
  }

  return typeof direct === "string" ? direct : undefined;
}
