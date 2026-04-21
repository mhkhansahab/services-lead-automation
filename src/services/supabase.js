import { requireEnv } from "../lib/env";
const SUPABASE_URL = () => requireEnv("SUPABASE_URL").replace(/\/$/, "");
const SUPABASE_KEY = () => requireEnv("SUPABASE_SECRET_KEY");
async function rest(path, method, body, headers) {
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
    if (response.status === 204)
        return [];
    return response.json();
}
export async function sbSelect(path) {
    return (await rest(path, "GET"));
}
export async function sbInsert(table, payload) {
    return (await rest(table, "POST", payload, { Prefer: "return=representation" }));
}
export async function sbUpsert(table, payload, onConflict) {
    return (await rest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, "POST", payload, {
        Prefer: "resolution=merge-duplicates,return=representation"
    }));
}
export async function sbUpdate(tableWithFilters, payload) {
    return (await rest(tableWithFilters, "PATCH", payload, { Prefer: "return=representation" }));
}
