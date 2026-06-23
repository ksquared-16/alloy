/**
 * Communications V2 — feature flags.
 *
 * Core surfaces (command center, record tab, live workspace, composer) default ON so
 * staging does not require Vercel env vars. Non-core packages stay default OFF for dark
 * rollout. Explicit env tokens override either way. Mirrors the env-boolean idiom in
 * `web/lib/communications/communicationsEnabled.ts` (read at call time, not module load).
 *
 * Server- and client-readable: keys map to NEXT_PUBLIC_* env vars so they can gate UI.
 *
 * PKG-01 (Communications V2). No product behavior — gating only.
 */

export const COMMS_V2_FLAG_KEYS = [
    "comms_v2_command_center",
    "comms_v2_record_tab",
    "comms_v2_composer",
    "comms_v2_preferences",
    "comms_v2_compliance",
    "comms_v2_assignment",
    "comms_v2_sla",
    "comms_v2_templates",
    "comms_v2_announcements",
    "comms_v2_deliverability",
    "comms_v2_bos",
    "comms_v2_live_workspace",
] as const;

export type CommsV2FlagKey = (typeof COMMS_V2_FLAG_KEYS)[number];

/** Stable env-var name for a flag key. Exported so tests and tooling can resolve it. */
const ENV_BY_KEY: Record<CommsV2FlagKey, string> = {
    comms_v2_command_center: "NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER",
    comms_v2_record_tab: "NEXT_PUBLIC_COMMS_V2_RECORD_TAB",
    comms_v2_composer: "NEXT_PUBLIC_COMMS_V2_COMPOSER",
    comms_v2_preferences: "NEXT_PUBLIC_COMMS_V2_PREFERENCES",
    comms_v2_compliance: "NEXT_PUBLIC_COMMS_V2_COMPLIANCE",
    comms_v2_assignment: "NEXT_PUBLIC_COMMS_V2_ASSIGNMENT",
    comms_v2_sla: "NEXT_PUBLIC_COMMS_V2_SLA",
    comms_v2_templates: "NEXT_PUBLIC_COMMS_V2_TEMPLATES",
    comms_v2_announcements: "NEXT_PUBLIC_COMMS_V2_ANNOUNCEMENTS",
    comms_v2_deliverability: "NEXT_PUBLIC_COMMS_V2_DELIVERABILITY",
    comms_v2_bos: "NEXT_PUBLIC_COMMS_V2_BOS",
    comms_v2_live_workspace: "NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE",
};

/** Returns the env-var name backing a flag key. */
export function commsV2FlagEnvName(key: CommsV2FlagKey): string {
    return ENV_BY_KEY[key];
}

/** Core V2 surfaces — default ON when env is unset; set env to false/0/no/off to revert to legacy. */
const CORE_COMMS_V2_FLAGS: ReadonlySet<CommsV2FlagKey> = new Set([
    "comms_v2_command_center",
    "comms_v2_record_tab",
    "comms_v2_composer",
    "comms_v2_live_workspace",
]);

function isTruthyEnvToken(value: string): boolean {
    return value === "1" || value === "true" || value === "yes" || value === "on";
}

function isFalsyEnvToken(value: string): boolean {
    return value === "0" || value === "false" || value === "no" || value === "off";
}

function resolveCommsV2Flag(raw: string | undefined, key: CommsV2FlagKey): boolean {
    const defaultEnabled = CORE_COMMS_V2_FLAGS.has(key);
    if (raw === undefined) return defaultEnabled;
    const v = raw.trim().toLowerCase();
    if (v === "") return defaultEnabled;
    if (isTruthyEnvToken(v)) return true;
    if (isFalsyEnvToken(v)) return false;
    return false;
}

/**
 * Whether a Communications V2 flag is enabled. Core flags default ON; non-core default OFF.
 * Explicit tokens: "1" | "true" | "yes" | "on" enable; "0" | "false" | "no" | "off" disable.
 */
export function isCommsV2FlagEnabled(key: CommsV2FlagKey): boolean {
    // STATIC process.env.NEXT_PUBLIC_* access is REQUIRED: Next.js only inlines NEXT_PUBLIC_* env into the
    // CLIENT bundle when referenced as a literal member expression. Dynamic process.env[name] is NOT inlined
    // → it is undefined in client components → every client-side flag would read false. Keep this a switch.
    switch (key) {
        case "comms_v2_command_center":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER, key);
        case "comms_v2_record_tab":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_RECORD_TAB, key);
        case "comms_v2_composer":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_COMPOSER, key);
        case "comms_v2_preferences":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_PREFERENCES, key);
        case "comms_v2_compliance":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_COMPLIANCE, key);
        case "comms_v2_assignment":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_ASSIGNMENT, key);
        case "comms_v2_sla":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_SLA, key);
        case "comms_v2_templates":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_TEMPLATES, key);
        case "comms_v2_announcements":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_ANNOUNCEMENTS, key);
        case "comms_v2_deliverability":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_DELIVERABILITY, key);
        case "comms_v2_bos":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_BOS, key);
        case "comms_v2_live_workspace":
            return resolveCommsV2Flag(process.env.NEXT_PUBLIC_COMMS_V2_LIVE_WORKSPACE, key);
        default:
            return false;
    }
}
