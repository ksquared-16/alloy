/**
 * WHO AN OPERATOR MAY REASONABLY MAKE RESPONSIBLE — one canonical read, server-side.
 *
 * ── THE BOUNDARY THIS DOES NOT MOVE ──
 *
 * `financial_responsibility_allocations.responsible_party_id` references `persons`, and
 * `arrangementService` enforces the real rule: every party must be a `persons` row in the same org.
 * That is the eligibility boundary and it stays exactly where it is. A forged id from another tenant
 * is refused there, not here.
 *
 * This resolver is an operator convenience over that rule. The server would accept any of the org's
 * 1,821 people; offering all of them would be a directory, not a decision. So it answers a narrower,
 * useful question — who is actually attached to THIS account — and the hard check still runs
 * underneath whatever the operator picks.
 *
 * ── WHERE THE PEOPLE COME FROM ──
 *
 * `customer_persons` is the canonical household edge: customer to person, with a role, a status and
 * date bounds. It is the forward path and it is customer-scoped, so no opportunity hop is needed.
 *
 * Existing share-holders are unioned in separately and deliberately. A person's household edge can
 * end while their responsibility share stands, and an arrangement nobody can edit because the
 * relationship moved on is worse than one that names someone no longer on the roster.
 *
 * ── WHY CHILDREN ARE NOT OFFERED ──
 *
 * Not by inference from age or table, but by the role vocabulary the org already defines:
 * `customer_person_role_types` carries `child` alongside `parent`, `guardian`, `payer` and the rest.
 * A child does not bear their own tuition, so that role is excluded by name.
 *
 * `payer` is offered but means nothing financial on its own: who has paid and who owes are different
 * facts, and responsibility begins only when the operator runs the canonical command.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * WHEN IS SOMEBODY STILL ON THE HOUSEHOLD?
 *
 * `customer_persons.status` is NULLABLE and has no default: 1,800 rows carry 'active' and two carry
 * nothing at all. A filter of `status = 'active'` therefore silently drops the rows nobody set —
 * which is the same shape as the defect being repaired here: a picker that offers nobody because
 * the read asked the wrong question, and an operator who is told the household is empty.
 *
 * So the rule is stated the other way round. A relationship is CURRENT unless it says it has ended:
 * a status that is set and is not active, or an end date that has passed. Absence of a statement is
 * not evidence of an ending.
 */
function relationshipHasEnded(row: { status?: unknown; end_date?: unknown }): boolean {
    const status = t(row.status).toLowerCase();
    if (status && status !== "active") return true;
    const end = t(row.end_date);
    if (end && end.slice(0, 10) < new Date().toISOString().slice(0, 10)) return true;
    return false;
}

/** Roles that describe someone who cannot bear the obligation. Named, never inferred. */
const NON_RESPONSIBLE_ROLE_TYPES = new Set(["child"]);

/*
 * ROLE VOCABULARY, SAID IN ENGLISH. The stored token is the org's, and an operator should not have
 * to read `primary_contact` off a screen. An unmapped role is title-cased rather than dropped: a
 * role this file has not met is still a true thing about the person.
 */
const ROLE_LABELS: Record<string, string> = {
    primary_contact: "Primary contact",
    parent: "Parent",
    parent_guardian: "Parent/guardian",
    guardian: "Guardian",
    payer: "Payer",
    emergency_contact: "Emergency contact",
    authorized_pickup: "Authorized pickup",
};

function roleLabelFor(role: string): string | null {
    if (!role) return null;
    return ROLE_LABELS[role] ?? role.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export type ResponsibilityPartyCandidate = {
    personId: string;
    name: string;
    /** Operator context — "Parent", "Payer". Presentation only; it confers no eligibility. */
    roleLabel: string | null;
    /** True when this person already holds a share, so the reason they are listed is visible. */
    holdsShare: boolean;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function personName(row: { full_name?: unknown; first_name?: unknown; last_name?: unknown }): string {
    return (
        t(row.full_name)
        || [t(row.first_name), t(row.last_name)].filter(Boolean).join(" ")
        || "Responsible party"
    );
}

/**
 * Candidates for one account, plus anyone already holding a share on the given charges.
 *
 * `chargeIds` is optional and exists so an arrangement in force can still be edited: the people on
 * it are included whether or not they are still on the household.
 */
export async function resolveResponsibilityPartyCandidates(
    supabase: SupabaseClient,
    args: { orgId: string; customerId: string | null; chargeIds?: readonly string[] },
): Promise<ResponsibilityPartyCandidate[]> {
    const byPerson = new Map<string, ResponsibilityPartyCandidate>();

    /* EXISTING SHARE-HOLDERS FIRST, so their `holdsShare` survives a later household match. */
    const chargeIds = (args.chargeIds ?? []).filter(Boolean);
    if (chargeIds.length > 0) {
        const { data, error } = await supabase
            .from("financial_responsibility_allocations")
            .select("responsible_party_id")
            .eq("org_id", args.orgId)
            .eq("state", "active")
            .in("charge_id", [...chargeIds]);
        if (error) throw new Error(`responsibility candidates: current parties could not be read (${error.message.trim()})`);
        for (const row of ((data ?? []) as Array<{ responsible_party_id: string | null }>)) {
            const id = t(row.responsible_party_id);
            if (id) byPerson.set(id, { personId: id, name: "", roleLabel: null, holdsShare: true });
        }
    }

    if (args.customerId) {
        const { data, error } = await supabase
            .from("customer_persons")
            .select("person_id, role_type, is_primary, status, end_date")
            .eq("org_id", args.orgId)
            .eq("customer_id", args.customerId);
        if (error) throw new Error(`responsibility candidates: the household could not be read (${error.message.trim()})`);
        type HouseholdRow = {
            person_id: string | null;
            role_type: string | null;
            status: string | null;
            end_date: string | null;
        };
        for (const row of ((data ?? []) as HouseholdRow[])) {
            const id = t(row.person_id);
            const role = t(row.role_type);
            if (!id || NON_RESPONSIBLE_ROLE_TYPES.has(role) || relationshipHasEnded(row)) continue;
            const existing = byPerson.get(id);
            /* ONE ROW PER PERSON. Holding two roles on an account is common and is not two people. */
            if (existing) {
                existing.roleLabel = existing.roleLabel ?? roleLabelFor(role);
                continue;
            }
            byPerson.set(id, { personId: id, name: "", roleLabel: roleLabelFor(role), holdsShare: false });
        }
    }

    const ids = [...byPerson.keys()];
    if (ids.length === 0) return [];

    /*
     * NAMES FROM `persons`, AND THE ORG FILTER IS LOAD-BEARING. A person the org does not own simply
     * does not come back, so a stale or foreign id cannot reach the operator wearing a name.
     */
    const { data: personRows, error: personError } = await supabase
        .from("persons")
        .select("id, full_name, first_name, last_name")
        .eq("org_id", args.orgId)
        .in("id", ids);
    if (personError) throw new Error(`responsibility candidates: people could not be named (${personError.message.trim()})`);

    const out: ResponsibilityPartyCandidate[] = [];
    for (const row of ((personRows ?? []) as Array<Record<string, unknown>>)) {
        const id = t(row.id);
        const candidate = byPerson.get(id);
        if (!candidate) continue;
        out.push({ ...candidate, name: personName(row) });
    }
    /* Current parties first — the arrangement being edited leads its own list. */
    return out.sort((a, b) => Number(b.holdsShare) - Number(a.holdsShare) || a.name.localeCompare(b.name));
}
