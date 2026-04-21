import crypto from "node:crypto";
import { requireEnv } from "../lib/env";
function normalizePrivateKey(value) {
    let key = String(value ?? "").trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1);
    }
    // Common .env encoding issue: PEM newlines are escaped as literal "\n".
    key = key.replace(/\\n/g, "\n");
    return key;
}
function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}
function parseServiceAccount() {
    const raw = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON").trim();
    const unwrapped = (raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))
        ? raw.slice(1, -1)
        : raw;
    let parsed;
    try {
        parsed = JSON.parse(unwrapped);
    }
    catch (error) {
        throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${String(error.message ?? error)}`);
    }
    if (!parsed.client_email || !parsed.private_key) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
    }
    const privateKey = normalizePrivateKey(parsed.private_key);
    if (!privateKey.includes("BEGIN PRIVATE KEY")) {
        throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON.private_key is not a valid PEM private key");
    }
    return {
        client_email: parsed.client_email,
        private_key: privateKey
    };
}
export async function googleAccessToken() {
    const serviceAccount = parseServiceAccount();
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
    }));
    const unsigned = `${header}.${payload}`;
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const signature = signer.sign(serviceAccount.private_key);
    const jwt = `${unsigned}.${base64url(signature)}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt
        })
    });
    if (!response.ok) {
        throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
    }
    const json = (await response.json());
    return json.access_token;
}
async function appendRowToRange(token, sheetId, rangeA1, row) {
    const range = encodeURIComponent(rangeA1);
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json"
        },
        body: JSON.stringify({ values: [row] })
    });
    if (!response.ok) {
        throw new Error(`Google Sheets append failed: ${response.status} ${await response.text()}`);
    }
}
async function firstSheetTitle(token, sheetId) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`, {
        headers: {
            authorization: `Bearer ${token}`
        }
    });
    if (!response.ok)
        return null;
    const json = (await response.json());
    return json.sheets?.[0]?.properties?.title ?? null;
}
export async function appendSyncLogRow(row) {
    const token = await googleAccessToken();
    const sheetId = requireEnv("GOOGLE_SHEET_ID");
    const tabName = (process.env.GOOGLE_SHEET_TAB_NAME ?? "Sync Log").trim();
    const escapedTab = tabName.replace(/'/g, "''");
    try {
        await appendRowToRange(token, sheetId, `'${escapedTab}'!A1`, row);
        return;
    }
    catch (error) {
        const message = String(error.message ?? error);
        if (!message.includes("Unable to parse range"))
            throw error;
    }
    const fallbackTitle = await firstSheetTitle(token, sheetId);
    if (fallbackTitle) {
        const escapedFallback = fallbackTitle.replace(/'/g, "''");
        await appendRowToRange(token, sheetId, `'${escapedFallback}'!A1`, row);
        return;
    }
    throw new Error("Google Sheets append failed: invalid range and unable to resolve fallback sheet title");
}
