import { readFileSync } from "node:fs";

export const EQUAL_FLAGS = [
    "NEXT_PUBLIC_COMMS_V2_COMPLIANCE",
    "AGENT_V1_RECORD_LAYOUT_ENABLED",
    "AI_ENRICHMENT_USE_PERMISSION_REQUIRED",
];

// These categories are presence-only. Values are intentionally never compared.
export const EXPECTED_VALUE_DIFFERENCES = [
    ["Environment identity", /^ALLOY_ENVIRONMENT$/],
    ["Supabase project and credentials", /SUPABASE/],
    ["Site and backend URLs", /(?:URL|BASE)$/],
    ["Provider accounts, live/test keys and senders", /^(?:TWILIO_|RESEND_|STRIPE_|NEXT_PUBLIC_STRIPE_|MARKETING_|OPENAI_)/],
    ["Signing, webhook and cron secrets", /(?:SECRET|TOKEN)$/],
];

export function loadPolicy() {
    const markdown = readFileSync(new URL("../../docs/platform/runtime/environments-p1s-settings-checklist-2026-11-25.md", import.meta.url), "utf8");
    const policy = {};
    for (const [platform, section] of [["vercel", "web"], ["render", "backend"]]) {
        const table = markdown.split(`<!-- settings:${section} -->`)[1]?.split("<!-- /settings -->")[0];
        if (!table) throw new Error("Checklist section missing");
        const rows = [...table.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \| ([A-Z]) \|/gm)]
            .map((m) => ({ key: m[1], cls: m[2] }));
        policy[platform] = {
            allowed: rows.filter(({ key, cls }) => ["R", "C"].includes(cls) && key !== "CRON_SECRET").map(({ key }) => key),
            required: rows.filter(({ cls }) => cls === "R").map(({ key }) => key),
            stagingOnly: rows.filter(({ cls }) => cls === "S").map(({ key }) => key),
            equalFlags: platform === "vercel" ? EQUAL_FLAGS : [],
        };
        policy[platform].allowed.push(...policy[platform].equalFlags);
    }
    return policy;
}
