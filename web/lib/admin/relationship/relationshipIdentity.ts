/**
 * WHO IS THIS PERSON? — the relationship-action authority's identity rule, for every person it links.
 *
 * Measured on staging (716053f5):
 *   - Family ZZQA1496R's paperwork named the parent "Parent ZZQA1496R" with a new phone; the household
 *     already had that parent with the old phone. Nothing matched by email/phone, so a SECOND
 *     "Parent ZZQA1496R" was created silently.
 *   - An emergency contact (not the guardian transaction) was resolved by find-or-create: the first
 *     person ANYWHERE in the organization with the same email or phone was reused, whatever their name
 *     and whichever family they belong to.
 *
 * The rule, for a submitted person (a draft):
 *   - one person shares the email/phone, is already in THIS household and has the same name → reuse it;
 *   - no one shares the email/phone and no one in this household has the same name → create;
 *   - anything else is ambiguous → refuse with the candidates, so the operator chooses an existing
 *     person, corrects the details, or (when only the name resembles) confirms a new person.
 * Nothing is merged, and a person in another household is never reused without the operator choosing them.
 * The guardian transaction (relationship_link_household_guardian) applies the same contact-match rule
 * inside its lock; this module adds the household name-resemblance check in front of it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmailForFindOrCreate, normalizePhoneForPersonWrite, personPhoneMatchValues } from "@/lib/identity";
import { relationshipOperatorMessage, RelationshipActionError, type GuardianIdentityCandidate } from "@/lib/admin/relationship/guardianLinkTransaction";

export type RelationshipIdentityDraft = {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    /** The operator confirmed this is a different person from a same-name household member. */
    confirmed_new_person?: boolean;
};

export type RelationshipIdentityCandidate = GuardianIdentityCandidate & {
    /** Shares the submitted email or phone (false: only the name resembles a household member). */
    readonly contact_match: boolean;
};

export type RelationshipIdentityDecision =
    | { kind: "create" }
    | { kind: "reuse"; personId: string }
    | { kind: "choose"; candidates: RelationshipIdentityCandidate[] };

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const sameName = (p: { first_name?: unknown; last_name?: unknown }, d: RelationshipIdentityDraft) =>
    Boolean(norm(d.first_name)) && norm(p.first_name) === norm(d.first_name) && norm(p.last_name) === norm(d.last_name);

type PersonRow = { id: string; first_name?: string | null; last_name?: string | null };

export async function findRelationshipIdentityCandidates(
    supabase: SupabaseClient,
    input: { orgId: string; customerId: string; draft: RelationshipIdentityDraft },
): Promise<RelationshipIdentityCandidate[]> {
    const email = normalizeEmailForFindOrCreate(input.draft.email ?? null);
    const phone = normalizePhoneForPersonWrite(input.draft.phone ?? null);

    const contactMatches = new Map<string, PersonRow>();
    if (email) {
        const { data, error } = await supabase.from("persons").select("id, first_name, last_name").eq("org_id", input.orgId).ilike("email", email).limit(10);
        if (error) throw new RelationshipActionError("relationship_write_failed", relationshipOperatorMessage("relationship_write_failed"));
        for (const p of (data ?? []) as PersonRow[]) contactMatches.set(p.id, p);
    }
    if (phone) {
        const { data, error } = await supabase.from("persons").select("id, first_name, last_name").eq("org_id", input.orgId).in("phone", personPhoneMatchValues(input.draft.phone ?? null)).limit(10);
        if (error) throw new RelationshipActionError("relationship_write_failed", relationshipOperatorMessage("relationship_write_failed"));
        for (const p of (data ?? []) as PersonRow[]) contactMatches.set(p.id, p);
    }

    const household = new Map<string, PersonRow>();
    if (input.customerId) {
        const { data, error } = await supabase
            .from("customer_persons")
            .select("person_id, persons(id, first_name, last_name)")
            .eq("org_id", input.orgId)
            .eq("customer_id", input.customerId);
        if (error) throw new RelationshipActionError("relationship_write_failed", relationshipOperatorMessage("relationship_write_failed"));
        for (const row of (data ?? []) as Array<{ person_id?: string; persons?: PersonRow | PersonRow[] | null }>) {
            const p = Array.isArray(row.persons) ? row.persons[0] : row.persons;
            if (row.person_id) household.set(row.person_id, p ?? { id: row.person_id });
        }
    }

    const candidates: RelationshipIdentityCandidate[] = [];
    const describe = (p: PersonRow, contact_match: boolean): RelationshipIdentityCandidate => ({
        person_id: p.id,
        display_name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unnamed person",
        in_household: household.has(p.id),
        same_name: sameName(p, input.draft),
        contact_match,
    });
    for (const p of contactMatches.values()) candidates.push(describe(p, true));
    for (const p of household.values()) {
        if (!contactMatches.has(p.id) && sameName(p, input.draft)) candidates.push(describe(p, false));
    }
    return candidates.sort((a, b) => a.person_id.localeCompare(b.person_id));
}

export function decideRelationshipIdentity(candidates: readonly RelationshipIdentityCandidate[], draft: RelationshipIdentityDraft): RelationshipIdentityDecision {
    const contact = candidates.filter((c) => c.contact_match);
    if (contact.length === 1 && contact[0]!.in_household && contact[0]!.same_name) return { kind: "reuse", personId: contact[0]!.person_id };
    if (contact.length > 0) return { kind: "choose", candidates: [...candidates] };
    if (candidates.length > 0 && !draft.confirmed_new_person) return { kind: "choose", candidates: [...candidates] };
    return { kind: "create" };
}

export function identityChoiceRequired(candidates: readonly RelationshipIdentityCandidate[]): RelationshipActionError {
    const nameOnly = candidates.every((c) => !c.contact_match);
    return new RelationshipActionError(
        "relationship_identity_choice_required",
        nameOnly
            ? "Someone with this name is already in this family — use them, or confirm this is a different person."
            : relationshipOperatorMessage("relationship_identity_choice_required"),
        candidates,
    );
}
