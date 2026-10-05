/**
 * WHO IS ALLOWED TO MOVE MONEY, AND CAN THE LEDGER NAME THEM?
 *
 * ── THE REQUIREMENT, STATED ONCE (W7-F002) ──
 *
 * A user permitted to create financial activity must resolve to a RECOGNISABLE HUMAN IDENTITY for
 * the financial audit trail. "Created by a person whose name is not on file" is not acceptable
 * attribution for money in a steady-state product, and the Director's walkthrough found exactly
 * that sentence on a charge's Details panel.
 *
 * Resolution has one path and it is the canonical one:
 *
 *     auth.users.id → user_person_links (active) → persons → a human name
 *
 * ── WHAT IS DELIBERATELY NOT A PATH ──
 *
 * EMAIL. Never, in either direction. `user_person_links` is emphatic about this and it is right:
 * email is mutable, unique by no constraint in this schema, and shared in practice. A wrong guess
 * puts one operator's name on another operator's financial act, and nothing announces it.
 *
 * THE AUTH ACCOUNT'S OWN DISPLAY NAME. Not a path for the REQUIREMENT, which is what this module
 * answers. `user_metadata.full_name` is whatever the account happened to be created with, is not
 * canonical human identity, and is not an operator's recorded decision about who this login is. A
 * surface may still DISPLAY it — a weak name beats no name on a screen — but a tenant whose
 * financial actors are identified only that way has not met the requirement, and this module must
 * say so rather than report the gap as closed.
 *
 * ── WHERE ENFORCEMENT BELONGS, AND WHY NOT HERE ──
 *
 * Not at the financial mutation. Refusing a charge because the operator's identity was never linked
 * strands a real person mid-transaction for an administrative omission they cannot fix from that
 * screen, and the deployed census measured 13 users holding a money-capable role with zero links of
 * any status — so mutation-time refusal would stop the tenant's billing outright. That is not an
 * enforcement point, it is an outage.
 *
 * The smallest point that actually prevents the state is the GRANT: `user_roles` acquiring a
 * money-capable role (`owner`, `admin`, `ops`) is the moment a user becomes able to move money, and
 * it is an administrative act performed by someone who can also link the person. That table is
 * Access's, not Financials', so this module provides the predicate and the vocabulary and names the
 * cross-lane work rather than reaching into another domain's write path.
 *
 * What Financials enforces is the part Financials owns: the ledger never claims a name it does not
 * have, the gap is visible on the surface where attribution is read, and it is countable so it can
 * be watched closing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveLinkedPersonId } from "@/lib/access/linkedPersonIdentity";
import { operatorIdentity } from "@/lib/access/operatorAccountName";

/**
 * The org roles that can create financial activity today.
 *
 * Measured rather than assumed: the deployed census found `admin` and `ops` in use, and
 * `financial_policies`/`charges` RLS gates childcare money on `has_org_role(org_id, ...)` with
 * owner/admin/ops. Named here so the identity requirement and the capability it attaches to are
 * stated in the same place.
 */
export const MONEY_CAPABLE_ORG_ROLES = ["owner", "admin", "ops"] as const;

export type FinancialActorIdentityStatus =
    /** Resolved through the canonical bridge to a person with a usable human name. Requirement met. */
    | "named"
    /** No actor was recorded at all — an automatic charge. Not a gap in identity. */
    | "no_actor"
    /** No active link exists for this user in this org. The ordinary unmet case. */
    | "not_linked"
    /** A link exists but the person it names is gone. A data fault, not an omission. */
    | "person_missing"
    /** A link exists and the person carries no usable name. Linked, still unnamed. */
    | "person_unnamed"
    /** The lookup itself failed. Not the same as "nobody is linked", and never reported as met. */
    | "unreadable";

export type FinancialActorIdentity = {
    status: FinancialActorIdentityStatus;
    /** The canonical human name, present only when `status === "named"`. */
    name: string | null;
    personId: string | null;
    /** True only for `named`. Every other status is an unmet requirement or an absent actor. */
    requirementMet: boolean;
};

const NO_ACTOR: FinancialActorIdentity = {
    status: "no_actor", name: null, personId: null, requirementMet: false,
};

/** A usable human name from a person row, or null. No email, no id, no placeholder. */
export function personDisplayName(person: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
} | null | undefined): string | null {
    if (!person) return null;
    const full = operatorIdentity({ display_name: person.full_name ?? null, email: null }).name;
    if (full) return full;
    const joined = [person.first_name, person.last_name].filter(Boolean).join(" ");
    return operatorIdentity({ display_name: joined, email: null }).name;
}

/**
 * The canonical human behind one financial actor.
 *
 * Returns a STATUS rather than a nullable name, because every caller needs to tell the four unmet
 * cases apart: an automatic charge has no actor and no gap; an unlinked operator is an
 * administrative omission someone can close; a link pointing at a missing person is a fault; and an
 * unreadable lookup is a question we could not answer, which must never be presented as either.
 */
export async function resolveFinancialActorIdentity(
    supabase: SupabaseClient,
    args: { orgId: string; actorUserId: string | null | undefined },
): Promise<FinancialActorIdentity> {
    const actorUserId = (args.actorUserId ?? "").trim();
    if (!actorUserId) return NO_ACTOR;

    let linked: Awaited<ReturnType<typeof resolveLinkedPersonId>>;
    try {
        linked = await resolveLinkedPersonId(supabase, args.orgId, actorUserId);
    } catch {
        return { status: "unreadable", name: null, personId: null, requirementMet: false };
    }
    if (!linked.resolved) {
        return { status: "unreadable", name: null, personId: null, requirementMet: false };
    }
    if (!linked.personId) {
        return { status: "not_linked", name: null, personId: null, requirementMet: false };
    }

    const { data, error } = await supabase
        .from("persons")
        .select("full_name, first_name, last_name")
        .eq("org_id", args.orgId)
        .eq("id", linked.personId)
        .maybeSingle();
    if (error) {
        return { status: "unreadable", name: null, personId: linked.personId, requirementMet: false };
    }
    const person = data as
        | { full_name: string | null; first_name: string | null; last_name: string | null }
        | null;
    if (!person) {
        return { status: "person_missing", name: null, personId: linked.personId, requirementMet: false };
    }
    const name = personDisplayName(person);
    if (!name) {
        return { status: "person_unnamed", name: null, personId: linked.personId, requirementMet: false };
    }
    return { status: "named", name, personId: linked.personId, requirementMet: true };
}

/**
 * The sentence an operator reads when the requirement is NOT met.
 *
 * It names the unmet requirement and where it is closed, because "not on file" told a reader that
 * something was missing and nothing about what or whose job it was. `null` for the two statuses
 * that are not gaps: a named actor, and a charge with no actor at all.
 */
export function financialActorIdentityGap(identity: FinancialActorIdentity): string | null {
    switch (identity.status) {
        case "named":
        case "no_actor":
            return null;
        case "not_linked":
            return "This operator's account is not linked to a person record, so the audit trail cannot name who did this. An owner or admin links the account to its person in Access.";
        case "person_missing":
            return "This operator's account is linked to a person record that no longer exists, so the audit trail cannot name who did this. Re-link the account in Access.";
        case "person_unnamed":
            return "This operator's account is linked to a person record that carries no name, so the audit trail cannot name who did this. Add the person's name, or re-link the account, in Access.";
        case "unreadable":
            return "Who this operator is could not be read just now, so this line is not evidence that the identity is missing. Reload before concluding anything from it.";
    }
}
