import { requireEnv } from "../lib/env";

type HttpMethod = "GET" | "POST" | "PATCH";

const SUPABASE_URL = () => requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_KEY = () => requireEnv("SUPABASE_SECRET_KEY");

async function rest(path: string, method: HttpMethod, body?: unknown, headers?: Record<string, string>) {
  const response = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY(),
      authorization: `Bearer ${SUPABASE_KEY()}`,
      "content-type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return [];
  return response.json();
}

export async function sbSelect<T = unknown>(path: string): Promise<T[]> {
  return (await rest(path, "GET")) as T[];
}

export async function sbInsert<T = unknown>(table: string, payload: unknown): Promise<T[]> {
  return (await rest(table, "POST", payload, { Prefer: "return=representation" })) as T[];
}

export async function sbUpsert<T = unknown>(table: string, payload: unknown, onConflict: string): Promise<T[]> {
  return (await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, "POST", payload, {
    Prefer: "resolution=merge-duplicates,return=representation"
  })) as T[];
}

export async function sbUpdate<T = unknown>(tableWithFilters: string, payload: unknown): Promise<T[]> {
  return (await rest(tableWithFilters, "PATCH", payload, { Prefer: "return=representation" })) as T[];
}
