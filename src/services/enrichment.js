import net from "node:net";
import { dedupe, extractDomain, normalizeEmail } from "../lib/utils";
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BLOCKED_LOCAL_PARTS = ["noreply", "no-reply", "donotreply", "example", "test"];
const MAX_RESPONSE_BYTES = 200_000;
const MAX_REDIRECTS = 3;
function isPrivateIpv4(hostname) {
    const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return true;
    const [a, b] = parts;
    return (a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168));
}
function isBlockedHostname(hostname) {
    const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (normalized === "localhost" ||
        normalized.endsWith(".localhost") ||
        normalized.endsWith(".local") ||
        normalized === "metadata.google.internal") {
        return true;
    }
    const ipVersion = net.isIP(normalized);
    if (ipVersion === 4)
        return isPrivateIpv4(normalized);
    if (ipVersion === 6) {
        return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
    }
    return false;
}
function safeHttpUrl(value, base) {
    try {
        const url = base ? new URL(value, base) : new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:")
            return null;
        if (url.username || url.password)
            return null;
        if (isBlockedHostname(url.hostname))
            return null;
        return url;
    }
    catch {
        return null;
    }
}
async function readLimitedText(response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/") && !contentType.includes("html") && !contentType.includes("xml")) {
        return "";
    }
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)
        return "";
    if (!response.body)
        return "";
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            return "";
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
}
async function fetchText(url) {
    let currentUrl = safeHttpUrl(url);
    if (!currentUrl)
        return "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
        for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
            const response = await fetch(currentUrl, { signal: controller.signal, redirect: "manual" });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get("location");
                if (!location)
                    return "";
                currentUrl = safeHttpUrl(location, currentUrl);
                if (!currentUrl)
                    return "";
                continue;
            }
            if (!response.ok)
                return "";
            return await readLimitedText(response);
        }
        return "";
    }
    catch {
        return "";
    }
    finally {
        clearTimeout(timeout);
    }
}
function extractEmails(text, domain) {
    const matches = text.match(EMAIL_REGEX) ?? [];
    const normalized = matches
        .map((email) => normalizeEmail(email))
        .filter(Boolean)
        .filter((email) => !BLOCKED_LOCAL_PARTS.some((blocked) => email.startsWith(`${blocked}@`)));
    if (!domain)
        return dedupe(normalized);
    const domainMatches = normalized.filter((email) => email.endsWith(`@${domain}`));
    return dedupe(domainMatches.length > 0 ? domainMatches : normalized);
}
export async function enrichBusinessWebsite(website) {
    if (!website)
        return { domain: null, email: null };
    const domain = extractDomain(website);
    if (!domain)
        return { domain: null, email: null };
    const baseUrl = website.startsWith("http://") || website.startsWith("https://") ? website : `https://${website}`;
    const candidates = [baseUrl, `${baseUrl.replace(/\/$/, "")}/contact`, `${baseUrl.replace(/\/$/, "")}/about`];
    const pages = await Promise.all(candidates.map((url) => fetchText(url)));
    const allText = pages.join("\n");
    const emails = extractEmails(allText, domain);
    return {
        domain,
        email: emails[0] ?? null
    };
}
