export function requireEnv(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value.trim();
}
export function envNumber(name, fallback) {
    const value = process.env[name];
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
export function envList(name) {
    const raw = requireEnv(name);
    return raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}
