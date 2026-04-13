export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function extractDomain(value: string | null | undefined): string | null {
  const input = String(value ?? "").trim().toLowerCase();
  if (!input) return null;

  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return new URL(input).hostname.replace(/^www\./, "");
    }
  } catch {
    return null;
  }

  if (input.includes("@")) {
    return input.split("@").pop() ?? null;
  }

  return input.replace(/^www\./, "");
}

export function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
