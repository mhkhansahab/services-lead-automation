import crypto from "node:crypto";
import { requireEnv } from "../lib/env";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function parseServiceAccount(): ServiceAccount {
  const raw = requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON");
  const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key");
  }
  return parsed as ServiceAccount;
}

export async function googleAccessToken(): Promise<string> {
  const serviceAccount = parseServiceAccount();
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    })
  );

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

  const json = (await response.json()) as { access_token: string };
  return json.access_token;
}

export async function appendSyncLogRow(row: (string | number)[]): Promise<void> {
  const token = await googleAccessToken();
  const sheetId = requireEnv("GOOGLE_SHEET_ID");
  const range = encodeURIComponent("Sync Log!A1");

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ values: [row] })
    }
  );

  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${response.status} ${await response.text()}`);
  }
}
