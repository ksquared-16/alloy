import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskAssistChildProfileV1 = {
    source: "customer_member" | "opportunity_metadata";
    customer_member_id: string | null;
    person_id: string | null;
    display_name: string | null;
    /** ISO date (YYYY-MM-DD) or full timestamp from DB when known. */
    dob_iso: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Normalize to YYYY-MM-DD when parseable (for age comparison). Lexicographic order matches chronological for ISO dates. */
export function normalizeChildDobToYyyyMmDd(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function displayNameFromMemberRow(row: Record<string, unknown>): string | null {
    const d = trimOrNull(row.display_name);
    if (d) return d;
    const fn = trimOrNull(row.first_name);
    const ln = trimOrNull(row.last_name);
    const joined = [fn, ln].filter(Boolean).join(" ").trim();
    return joined || null;
}

function displayNameFromMetadataChild(row: Record<string, unknown>): string | null {
    const joinedName = [row.first_name, row.last_name]
        .filter((x) => typeof x === "string" && String(x).trim())
        .join(" ")
        .trim();
    return (
        trimOrNull(row.display_name) ??
        trimOrNull(row.child_name) ??
        trimOrNull(row.name) ??
        (joinedName || null)
    );
}

function profileDedupeKey(p: TaskAssistChildProfileV1): string {
    const cm = p.customer_member_id?.trim();
    if (cm) return `cm:${cm}`;
    const pid = p.person_id?.trim();
    if (pid) return `pid:${pid}`;
    const n = (p.display_name ?? "").trim().toLowerCase();
    const d = (p.dob_iso ?? "").trim();
    return `nm:${n}|dob:${d}`;
}

function mergeProfile(into: TaskAssistChildProfileV1[], next: TaskAssistChildProfileV1): void {
    const k = profileDedupeKey(next);
    const idx = into.findIndex((p) => profileDedupeKey(p) === k);
    if (idx < 0) {
        into.push(next);
        return;
    }
    const cur = into[idx]!;
    if (cur.source === "opportunity_metadata" && next.source === "customer_member") {
        into[idx] = { ...next, display_name: next.display_name ?? cur.display_name, dob_iso: next.dob_iso ?? cur.dob_iso };
    }
}

/**
 * Summarize linked child profiles for Task Assist context (no names in this line — names live in structured fields).
 */
export function summarizeChildrenFromProfiles(profiles: TaskAssistChildProfileV1[]): string | null {
    const n = profiles.length;
    if (n === 0) return null;
    if (n === 1) return "One child profile is linked for this family.";
    return `${n} child profiles are linked for this family.`;
}

/**
 * Pick a single child display name for careful personalization:
 * - If exactly one named profile → that name.
 * - If multiple and all named profiles share a parseable DOB → youngest (latest DOB).
 * - Otherwise → null (caller uses neutral family wording).
 */
export function resolvePrimaryChildDisplayNameFromProfiles(profiles: TaskAssistChildProfileV1[]): string | null {
    const named = profiles.map((p) => ({ ...p, display_name: p.display_name?.trim() || null })).filter((p) => p.display_name);
    if (named.length === 1) return named[0]!.display_name;
    if (named.length < 2) return null;
    const withDob = named
        .map((p) => ({ ...p, dobNorm: normalizeChildDobToYyyyMmDd(p.dob_iso) }))
        .filter((p) => p.dobNorm != null) as Array<TaskAssistChildProfileV1 & { dobNorm: string }>;
    if (withDob.length < 2) return null;
    withDob.sort((a, b) => (a.dobNorm < b.dobNorm ? -1 : a.dobNorm > b.dobNorm ? 1 : (a.display_name ?? "").localeCompare(b.display_name ?? "")));
    const youngest = withDob[withDob.length - 1]!;
    return youngest.display_name;
}

function parseMetadataInquiryChildren(metadata: unknown): TaskAssistChildProfileV1[] {
    if (!metadata || typeof metadata !== "object") return [];
    const kids = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(kids)) return [];
    const out: TaskAssistChildProfileV1[] = [];
    for (const raw of kids) {
        if (!raw || typeof raw !== "object") continue;
        const row = raw as Record<string, unknown>;
        const cm = trimOrNull(row.customer_member_id);
        const pid = trimOrNull(row.person_id);
        const name = displayNameFromMetadataChild(row);
        const dob =
            normalizeChildDobToYyyyMmDd(trimOrNull(row.dob)) ??
            normalizeChildDobToYyyyMmDd(trimOrNull(row.date_of_birth)) ??
            normalizeChildDobToYyyyMmDd(trimOrNull(row.dob_iso));
        if (!name && !cm && !pid) continue;
        out.push({
            source: "opportunity_metadata",
            customer_member_id: cm,
            person_id: pid,
            display_name: name,
            dob_iso: dob,
        });
    }
    return out;
}

export async function fetchTaskAssistChildProfilesForOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    customerId: string | null;
    opportunityMetadata: unknown;
}): Promise<TaskAssistChildProfileV1[]> {
    const merged: TaskAssistChildProfileV1[] = [];
    const { supabase, orgId, customerId, opportunityMetadata } = params;

    if (customerId) {
        const { data: members, error } = await supabase
            .from("customer_members")
            .select("id, display_name, first_name, last_name, dob, person_id, relationship, is_active")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("relationship", "child")
            .eq("is_active", true);
        if (error) {
            console.error("[fetchTaskAssistChildProfilesForOpportunity] customer_members", error);
        } else {
            const rows = (members ?? []) as Record<string, unknown>[];
            const personIds = [...new Set(rows.map((r) => trimOrNull(r.person_id)).filter(Boolean))] as string[];
            const personDobById = new Map<string, string>();
            if (personIds.length) {
                const { data: people, error: pErr } = await supabase
                    .from("persons")
                    .select("id, date_of_birth")
                    .eq("org_id", orgId)
                    .in("id", personIds);
                if (pErr) console.error("[fetchTaskAssistChildProfilesForOpportunity] persons dob", pErr);
                for (const pr of (people ?? []) as { id?: string; date_of_birth?: string | null }[]) {
                    const id = String(pr.id ?? "").trim();
                    const dob = normalizeChildDobToYyyyMmDd(pr.date_of_birth != null ? String(pr.date_of_birth) : null);
                    if (id && dob) personDobById.set(id, dob);
                }
            }
            for (const row of rows) {
                const pid = trimOrNull(row.person_id);
                const memberDob = normalizeChildDobToYyyyMmDd(row.dob != null ? String(row.dob) : null);
                const dob = pid && personDobById.has(pid) ? personDobById.get(pid)! : memberDob;
                mergeProfile(merged, {
                    source: "customer_member",
                    customer_member_id: String(row.id ?? "").trim() || null,
                    person_id: pid,
                    display_name: displayNameFromMemberRow(row),
                    dob_iso: dob,
                });
            }
        }
    }

    for (const metaChild of parseMetadataInquiryChildren(opportunityMetadata)) {
        mergeProfile(merged, metaChild);
    }

    return merged;
}
