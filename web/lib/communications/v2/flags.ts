/**
 * Communications V2 — feature flags.
 *
 * All flags default OFF for safe, dark rollout. Surfaces gate on these so V2 can
 * land package-by-package without exposing partial UI. Mirrors the env-boolean idiom
 * in `web/lib/communications/communicationsEnabled.ts` (read at call time, not module load).
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
};

/** Returns the env-var name backing a flag key. */
export function commsV2FlagEnvName(key: CommsV2FlagKey): string {
    return ENV_BY_KEY[key];
}

function envEnabled(value: string | undefined): boolean {
    const v = (value ?? "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

/**
 * Whether a Communications V2 flag is enabled. Defaults to false when the backing
 * env var is unset or not a truthy token ("1" | "true" | "yes", case-insensitive).
 */
export function isCommsV2FlagEnabled(key: CommsV2FlagKey): boolean {
    // STATIC process.env.NEXT_PUBLIC_* access is REQUIRED: Next.js only inlines NEXT_PUBLIC_* env into the
    // CLIENT bundle when referenced as a literal member expression. Dynamic process.env[name] is NOT inlined
    // → it is undefined in client components → every client-side flag would read false. Keep this a switch.
    switch (key) {
        case "comms_v2_command_center":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_COMMAND_CENTER);
        case "comms_v2_record_tab":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_RECORD_TAB);
        case "comms_v2_composer":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_COMPOSER);
        case "comms_v2_preferences":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_PREFERENCES);
        case "comms_v2_compliance":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_COMPLIANCE);
        case "comms_v2_assignment":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_ASSIGNMENT);
        case "comms_v2_sla":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_SLA);
        case "comms_v2_templates":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_TEMPLATES);
        case "comms_v2_announcements":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_ANNOUNCEMENTS);
        case "comms_v2_deliverability":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_DELIVERABILITY);
        case "comms_v2_bos":
            return envEnabled(process.env.NEXT_PUBLIC_COMMS_V2_BOS);
        default:
            return false;
    }
}
