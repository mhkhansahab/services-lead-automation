import { readFile } from "node:fs/promises";
import { requireEnv } from "../lib/env";
import { sendEmail } from "../services/resend";
function getRecipient() {
    const cliEmail = process.argv[2]?.trim();
    if (cliEmail)
        return cliEmail;
    const envEmail = process.env.TEST_EMAIL?.trim();
    if (envEmail)
        return envEmail;
    throw new Error("Provide recipient email as arg or set TEST_EMAIL in .env");
}
async function loadHtmlTemplate() {
    const templateUrl = new URL("../../templates/cold_email_modern_v2.html", import.meta.url);
    return readFile(templateUrl, "utf8");
}
function renderTemplate(template) {
    const variables = {
        business_name: "Acme Plumbing",
        contact_name_or_owner: "Hamza",
        business_category: "home services",
        business_address: requireEnv("BUSINESS_ADDRESS")
    };
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
}
function textVersion() {
    return [
        "Hi Hamza,",
        "",
        "I came across Acme Plumbing and wanted to reach out with a simple idea in home services.",
        "",
        "I provide services that help businesses automate repetitive work using AI agentic automations. Common use cases are custom chatbots, lead generation, lead follow-ups, and sales pitches created from meeting transcriptions.",
        "",
        "If this is useful, I can share 2-3 practical automation ideas for Acme Plumbing. No long pitch.",
        "If it is not relevant, reply with \"not now\" and I will not follow up.",
        "",
        "Best,",
        "Hamza Khan",
        "buildwithhamza.com",
        requireEnv("BUSINESS_ADDRESS"),
        "Reply with \"unsubscribe\" to stop receiving emails."
    ].join("\n");
}
async function main() {
    const to = getRecipient();
    const fromName = requireEnv("EMAIL_FROM_NAME");
    const fromAddress = requireEnv("EMAIL_FROM_ADDRESS");
    const replyTo = requireEnv("EMAIL_REPLY_TO");
    const html = renderTemplate(await loadHtmlTemplate());
    const text = textVersion();
    const result = await sendEmail({
        from: `${fromName} <${fromAddress}>`,
        to: [to],
        reply_to: replyTo,
        subject: "Idea for Acme Plumbing",
        text,
        html,
        headers: {
            "List-Unsubscribe": `<mailto:${replyTo}?subject=unsubscribe>`
        }
    });
    console.log(`Test email sent to ${to}. Resend ID: ${result.id}`);
}
main().catch((error) => {
    console.error("Failed to send test email:", error);
    process.exit(1);
});
