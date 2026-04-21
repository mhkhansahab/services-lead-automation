import { requireEnv } from "../lib/env";
const RESEND_API_KEY = () => requireEnv("RESEND_API_KEY");
export async function sendEmail(payload) {
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            authorization: `Bearer ${RESEND_API_KEY()}`,
            "content-type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(`Resend send failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json());
}
export async function listEmails(limit = 100, after) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (after)
        params.set("after", after);
    const response = await fetch(`https://api.resend.com/emails?${params.toString()}`, {
        headers: {
            authorization: `Bearer ${RESEND_API_KEY()}`
        }
    });
    if (!response.ok) {
        throw new Error(`Resend list failed: ${response.status} ${await response.text()}`);
    }
    return (await response.json());
}
