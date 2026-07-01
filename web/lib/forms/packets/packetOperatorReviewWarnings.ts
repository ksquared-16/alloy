import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OperatorReviewWarning = {
    kind: string;
    message: string;
    field_key?: string;
};

function parseUuid(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return UUID_RE.test(t) ? t : null;
}

function normName(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** True when strings are clearly different identity labels (not substring containment). */
function matchesAnyExpected(value: string, expected: string[]): boolean {
    const v = normName(value);
    if (v.length < 2) return true;
    for (const e of expected) {
        const en = normName(e);
        if (!en) continue;
        if (v === en || v.includes(en) || en.includes(v)) return true;
    }
    return false;
}

const NAMEISH_KEY = /(name|first|last|guardian|parent|child|enrollee|student|member|household)/i;

async function loadPersonFullName(
    supabase: SupabaseClient,
    orgId: string,
    personId: string | null
): Promise<string | null> {
    if (!personId) return null;
    const { data, error } = await supabase
        .from("persons")
        .select("first_name, last_name")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (error || !data) return null;
    const p = data as { first_name?: string | null; last_name?: string | null };
    const fn = typeof p.first_name === "string" ? p.first_name.trim() : "";
    const ln = typeof p.last_name === "string" ? p.last_name.trim() : "";
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    return full || null;
}

async function loadMemberFullName(
    supabase: SupabaseClient,
    orgId: string,
    memberId: string | null
): Promise<string | null> {
    if (!memberId) return null;
    const { data, error } = await supabase
        .from("customer_members")
        .select("first_name, last_name, display_name")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();
    if (error || !data) return null;
    const m = data as { first_name?: string | null; last_name?: string | null; display_name?: string | null };
    const dn = typeof m.display_name === "string" ? m.display_name.trim() : "";
    if (dn) return dn;
    const fn = typeof m.first_name === "string" ? m.first_name.trim() : "";
    const ln = typeof m.last_name === "string" ? m.last_name.trim() : "";
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    return full || null;
}

/**
 * Compare trusted CRM snapshot FKs to shallow-merged packet `shared_values` name-like fields.
 * Never blocks submission — warnings only for operator review.
 */
export async function computePacketOperatorReviewWarnings(params: {
    supabase: SupabaseClient;
    orgId: string;
    crmSnapshot: Record<string, unknown>;
    sharedValues: Record<string, unknown>;
}): Promise<OperatorReviewWarning[]> {
    const { supabase, orgId, crmSnapshot, sharedValues } = params;
    const personId = parseUuid(crmSnapshot.person_id);
    const memberId = parseUuid(crmSnapshot.customer_member_id);

    const [personName, memberName] = await Promise.all([
        loadPersonFullName(supabase, orgId, personId),
        loadMemberFullName(supabase, orgId, memberId),
    ]);

    const expected = [personName, memberName].filter((x): x is string => Boolean(x && x.trim()));
    if (expected.length === 0) return [];

    const warnings: OperatorReviewWarning[] = [];
    const seen = new Set<string>();

    for (const [rawKey, rawVal] of Object.entries(sharedValues)) {
        if (typeof rawVal !== "string") continue;
        const val = rawVal.trim();
        if (val.length < 2) continue;
        if (!NAMEISH_KEY.test(rawKey)) continue;
        if (matchesAnyExpected(val, expected)) continue;
        const key = `${rawKey}:${normName(val)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push({
            kind: "submitted_text_differs_from_crm",
            field_key: rawKey,
            message: `Submitted “${val.slice(0, 80)}${val.length > 80 ? "…" : ""}” does not match CRM name on file (${expected.join(" · ")}). Confirm before updating trusted records.`,
        });
    }

    return warnings;
}
