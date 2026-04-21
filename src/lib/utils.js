export function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}
export function extractDomain(value) {
    const input = String(value ?? "").trim().toLowerCase();
    if (!input)
        return null;
    try {
        if (input.startsWith("http://") || input.startsWith("https://")) {
            return new URL(input).hostname.replace(/^www\./, "");
        }
    }
    catch {
        return null;
    }
    if (input.includes("@")) {
        return input.split("@").pop() ?? null;
    }
    return input.replace(/^www\./, "");
}
export function normalizeText(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}
export function dedupe(items) {
    return [...new Set(items)];
}
