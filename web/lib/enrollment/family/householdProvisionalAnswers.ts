/**
 * WHAT A SIBLING'S JOURNEY ALREADY TOLD US ABOUT THE HOUSEHOLD — offered, never assumed.
 *
 * Each child's answers live in that child's own session, and nothing read another session's, so a
 * family enrolling two children typed the household's address, phone and parent details twice. The
 * canonical record covers what the organization already held; it does not cover what the family
 * told a sibling's journey a minute ago, which is provisional — a Form answer, not a record.
 *
 * So a sibling's answer is reused under three rules:
 *
 *   HOUSEHOLD FACTS ONLY  Only bound keys about the household and its adults cross between
 *                         siblings: `customer:*`, `household:*`, `guardian:*` / `guardian_*`, and
 *                         `person:*` — the Admissions packet binds the family's home address to
 *                         `person:address_line1`… A sibling answered the IDENTICAL need (same key,
 *                         same collapsing), so reuse is the same question, confirmed again here.
 *                         A child's own facts (`customer_member:*`, `child_*`, start date) and a
 *                         form-specific answer (`process:*`) never cross — one child's allergies
 *                         are not the other's.
 *   LOWEST PRECEDENCE     This child's own answer wins, then the canonical record, then a sibling's.
 *   ALWAYS CONFIRMED      It is shown as known and must be confirmed in this child's journey;
 *                         confirming writes it into THIS child's session as this child's answer.
 *                         Nothing is promoted to a canonical record here.
 *
 * Only the household's own children's Enrollment journeys are read, never this journey itself.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

/** The reserved carrier key inside `canonicalValues`; read only by the need projection. */
export const HOUSEHOLD_PROVISIONAL_VALUES_KEY = "__household_provisional_answers__" as const;

export function isSharedHouseholdKey(key: string): boolean {
    if (key.startsWith("customer_member")) return false;
    return /^(customer|household|person):/.test(key) || /^guardian[:_]/.test(key);
}

function usable(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

/** Household-scoped answers the household's OTHER child journeys hold, newest session first. */
export async function readHouseholdProvisionalAnswers(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string; readonly processInstanceId: string },
): Promise<Record<string, unknown>> {
    try {
        const { data: members } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("customer_id", input.customerId);
        const children = ((members ?? []) as { id: string }[]).map((m) => m.id);
        if (children.length === 0) return {};

        const { data: instances } = await supabase
            .from("process_instances")
            .select("id, process_key, subject_type")
            .eq("org_id", input.orgId)
            .in("subject_id", children);
        const siblingJourneys = ((instances ?? []) as Array<{ id: string; process_key?: string | null; subject_type?: string | null }>)
            .filter((i) => i.id !== input.processInstanceId)
            .filter((i) => (i.subject_type ?? "child") === "child")
            .filter((i) => !i.process_key || i.process_key === ENROLLMENT_PROCESS_KEY)
            .map((i) => i.id);
        if (siblingJourneys.length === 0) return {};

        const { data: sessions } = await supabase
            .from("form_packet_sessions")
            .select("shared_values, updated_at")
            .eq("org_id", input.orgId)
            .in("process_instance_id", siblingJourneys);
        const newestFirst = ((sessions ?? []) as Array<{ shared_values?: Record<string, unknown> | null; updated_at?: string | null }>)
            .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));

        const out: Record<string, unknown> = {};
        for (const session of newestFirst) {
            for (const [key, value] of Object.entries(session.shared_values ?? {})) {
                if (key in out || !isSharedHouseholdKey(key) || !usable(value)) continue;
                out[key] = value;
            }
        }
        return out;
    } catch {
        // Nothing offered; every affected fact is simply asked.
        return {};
    }
}

/** Attach provisional answers to a canonical-values map for the need projection, canonical first. */
export function canonicalValuesWithHouseholdProvisional(
    canonical: Readonly<Record<string, unknown>>,
    provisional: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> {
    const offered = Object.fromEntries(Object.entries(provisional ?? {}).filter(([k]) => !usable(canonical[k])));
    return Object.keys(offered).length ? { ...canonical, [HOUSEHOLD_PROVISIONAL_VALUES_KEY]: offered } : { ...canonical };
}

/** The provisional household answer for a key, if one was attached. */
export function householdProvisionalValue(
    canonicalValues: Readonly<Record<string, unknown>> | undefined,
    key: string | null,
): unknown {
    if (!canonicalValues || !key) return undefined;
    const carrier = canonicalValues[HOUSEHOLD_PROVISIONAL_VALUES_KEY];
    if (!carrier || typeof carrier !== "object" || Array.isArray(carrier)) return undefined;
    return (carrier as Record<string, unknown>)[key];
}
