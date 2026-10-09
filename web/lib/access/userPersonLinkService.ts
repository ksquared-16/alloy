/**
 * RECORDING WHO AN ACCOUNT BELONGS TO — the write half of the identity bridge.
 *
 * `linkedPersonIdentity` next door reads this bridge. Nothing wrote it. The table has existed since
 * September 2026 with one reader and zero writers, so on the deployed estate it is empty: 13 users
 * hold a money-capable org role and not one of them resolves to a person. W7-F002 made that
 * load-bearing — a financial audit trail that cannot name who moved money is not acceptable — so
 * this is the explicit, recorded, revocable act the table's own migration says is the only way a
 * link may come into existence.
 *
 * ── WHAT THIS REFUSES TO DO ──
 *
 * INFER. There is no matcher here and there must never be one. Both ids are required from the
 * caller; `persons.email = auth.users.email` is the shortcut the migration refuses by name, because
 * email is mutable, unique by no constraint in this schema, and shared in practice. `web/lib/identity`
 * exists to GUESS which records describe the same human, with confidence bands, and it is right for
 * merging duplicate contacts and exactly wrong for deciding authority.
 *
 * CROSS A TENANT. Every read and write is org-scoped, and the database enforces it independently:
 * `trg_user_person_link_same_org` refuses a link whose person belongs to another organisation. The
 * check here exists to produce a sentence an administrator can act on, not to be the only guard.
 *
 * DECIDE CAPABILITY. Who may link is the route's question, answered by Access's own gate and by the
 * table's RLS (owner and admin only). This service is called with an admin client and assumes the
 * decision has already been made.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isMoneyCapableCapability } from "@/lib/access/personLinkRequirement";
import { personDisplayName } from "@/lib/financials/identity/financialActorIdentity";

export class UserPersonLinkError extends Error {
    readonly status: number;
    constructor(message: string, status = 400) {
        super(message);
        this.name = "UserPersonLinkError";
        this.status = status;
    }
}

export type UserPersonLinkRow = {
    id: string;
    userId: string;
    personId: string;
    status: string;
    linkedAt: string | null;
    /** The linked person's name, so the surface shows who, not an id. */
    personName?: string | null;
};

export type UnresolvedActor = {
    userId: string;
    /** The roles through which this user holds a money-capable capability. */
    roles: string[];
    /** The money-capable capabilities held. Resolved the way every gate resolves authority. */
    capabilities: string[];
};

export type UserPersonLinkState = {
    /** Active links in this organisation, so an administrator sees what is already decided. */
    links: UserPersonLinkRow[];
    /**
     * Users holding a money-capable CAPABILITY (user_roles → role_permission_grants, the same
     * resolution every gate uses) and carrying no active link.
     *
     * The point of the route: these are the accounts whose financial acts the ledger cannot
     * attribute to a human. No email and no display name is returned — an administrator who needs
     * to identify an account has the Users surface for that, and this answers only "which are
     * unresolved".
     */
    unresolvedMoneyCapableActors: UnresolvedActor[];
    /** Named, unarchived persons in this organisation who could be linked. */
    linkCandidates: Array<{ personId: string; name: string }>;
};

function requiredId(value: string, field: string): string {
    const v = (value ?? "").trim();
    if (!v) throw new UserPersonLinkError(`${field} is required: a link is never inferred.`);
    /* Shape only. Existence and tenancy are checked below, against the database. */
    if (!/^[0-9a-f-]{32,36}$/i.test(v)) throw new UserPersonLinkError(`${field} is not an id.`);
    return v;
}

export async function listUserPersonLinkState(
    supabase: SupabaseClient,
    args: { orgId: string },
): Promise<UserPersonLinkState> {
    const orgId = (args.orgId ?? "").trim();
    if (!orgId) throw new UserPersonLinkError("An organisation is required.", 400);

    const { data: linkRows, error: linkError } = await supabase
        .from("user_person_links")
        .select("id, user_id, person_id, status, linked_at")
        .eq("org_id", orgId)
        .eq("status", "active");
    if (linkError) throw new UserPersonLinkError(linkError.message, 500);
    const linkedUserIds = new Set(((linkRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));

    /* Money capability is a CAPABILITY, held through any role — not a list of role names. */
    const { data: grantRows, error: grantError } = await supabase
        .from("role_permission_grants")
        .select("role_key, permission_key")
        .eq("org_id", orgId)
        .eq("allowed", true);
    if (grantError) throw new UserPersonLinkError(grantError.message, 500);
    const moneyKeysByRole = new Map<string, string[]>();
    for (const g of (grantRows ?? []) as Array<{ role_key: string; permission_key: string }>) {
        if (!isMoneyCapableCapability(g.permission_key)) continue;
        moneyKeysByRole.set(g.role_key, [...(moneyKeysByRole.get(g.role_key) ?? []), g.permission_key]);
    }
    const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("org_id", orgId);
    if (roleError) throw new UserPersonLinkError(roleError.message, 500);
    const moneyByUser = new Map<string, { roles: Set<string>; capabilities: Set<string> }>();
    for (const row of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        const keys = moneyKeysByRole.get(row.role);
        if (!keys?.length) continue;
        const entry = moneyByUser.get(row.user_id) ?? { roles: new Set<string>(), capabilities: new Set<string>() };
        entry.roles.add(row.role);
        for (const k of keys) entry.capabilities.add(k);
        moneyByUser.set(row.user_id, entry);
    }

    const { data: personRows, error: personError } = await supabase
        .from("persons")
        .select("id, full_name, first_name, last_name, archived_at")
        .eq("org_id", orgId)
        .is("archived_at", null);
    if (personError) throw new UserPersonLinkError(personError.message, 500);
    const linkCandidates: Array<{ personId: string; name: string }> = [];
    const nameByPerson = new Map<string, string>();
    for (const row of (personRows ?? []) as Array<{
        id: string; full_name: string | null; first_name: string | null; last_name: string | null;
    }>) {
        const name = personDisplayName(row);
        /* An unnamed person cannot satisfy the requirement, so offering one would be a dead end. */
        if (name) {
            linkCandidates.push({ personId: row.id, name });
            nameByPerson.set(row.id, name);
        }
    }
    const linkedPersonIds = new Set(((linkRows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id));
    const links = ((linkRows ?? []) as Array<{
        id: string; user_id: string; person_id: string; status: string; linked_at: string | null;
    }>).map((r) => ({
        id: r.id, userId: r.user_id, personId: r.person_id, status: r.status, linkedAt: r.linked_at,
        personName: nameByPerson.get(r.person_id) ?? null,
    }));

    return {
        links,
        unresolvedMoneyCapableActors: [...moneyByUser.entries()]
            .filter(([userId]) => !linkedUserIds.has(userId))
            .map(([userId, held]) => ({ userId, roles: [...held.roles].sort(), capabilities: [...held.capabilities].sort() })),
        /* A person already answering to another login is not a candidate: the index would refuse it. */
        linkCandidates: linkCandidates.filter((c) => !linkedPersonIds.has(c.personId)),
    };
}

/**
 * Record one link, explicitly named in both directions.
 *
 * The database owns the invariants that matter — one active person per user and one active user per
 * person, both per org, by partial unique index; and same-org, by trigger. This adds the sentences
 * an administrator can act on, and the one requirement that is ours rather than the schema's: the
 * person must carry a NAME, because a link to an unnamed person satisfies nothing. Linking to one
 * would record a decision that leaves the audit trail exactly as unable to say who acted.
 */
export async function createUserPersonLink(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string; personId: string; note: string; linkedBy: string | null },
): Promise<UserPersonLinkRow> {
    const orgId = (args.orgId ?? "").trim();
    if (!orgId) throw new UserPersonLinkError("An organisation is required.", 400);
    const userId = requiredId(args.userId, "user_id");
    const personId = requiredId(args.personId, "person_id");
    const note = (args.note ?? "").trim();
    if (note.length < 4) {
        throw new UserPersonLinkError(
            "A note is required: an identity decision with no recorded reason is one nobody can review later.",
        );
    }

    await assertLinkablePerson(supabase, orgId, personId);

    const { data, error } = await supabase
        .from("user_person_links")
        .insert({
            org_id: orgId,
            user_id: userId,
            person_id: personId,
            status: "active",
            linked_by: args.linkedBy,
            note,
        })
        .select("id, user_id, person_id, status, linked_at")
        .single();
    if (error) {
        /*
         * 23505 is one of the two partial unique indexes: this user already resolves to somebody,
         * or this person already answers to another login. Both are refusals with a real meaning,
         * and neither is a server fault.
         */
        if ((error as { code?: string }).code === "23505") {
            throw new UserPersonLinkError(
                "Either this account is already linked to a person, or this person is already linked to another account. Revoke the existing link first.",
                409,
            );
        }
        throw new UserPersonLinkError(error.message, 500);
    }
    const row = data as { id: string; user_id: string; person_id: string; status: string; linked_at: string | null };
    return {
        id: row.id, userId: row.user_id, personId: row.person_id, status: row.status, linkedAt: row.linked_at,
    };
}

/** The person a link may name: exists, same organisation, unarchived, and carries a name. */
async function assertLinkablePerson(supabase: SupabaseClient, orgId: string, personId: string): Promise<void> {
    const { data: personRow, error: personError } = await supabase
        .from("persons")
        .select("id, org_id, full_name, first_name, last_name, archived_at")
        .eq("id", personId)
        .maybeSingle();
    if (personError) throw new UserPersonLinkError(personError.message, 500);
    const person = personRow as
        | { id: string; org_id: string; full_name: string | null; first_name: string | null; last_name: string | null; archived_at: string | null }
        | null;
    if (!person) throw new UserPersonLinkError("No such person.", 404);
    if (person.org_id !== orgId) {
        /* The trigger would refuse this too. Saying so here is how an administrator learns why. */
        throw new UserPersonLinkError("That person belongs to another organisation.", 403);
    }
    if (person.archived_at) throw new UserPersonLinkError("That person is archived.", 409);
    if (!personDisplayName(person)) {
        throw new UserPersonLinkError(
            "That person record carries no name, so linking to it would leave the audit trail unable to say who acted. Add the name first.",
            409,
        );
    }
}

function requiredNote(value: string): string {
    const note = (value ?? "").trim();
    if (note.length < 4) {
        throw new UserPersonLinkError(
            "A note is required: an identity decision with no recorded reason is one nobody can review later.",
        );
    }
    return note;
}

function linkRowFrom(data: unknown): UserPersonLinkRow {
    const row = data as { id: string; user_id: string; person_id: string; status: string; linked_at: string | null };
    return { id: row.id, userId: row.user_id, personId: row.person_id, status: row.status, linkedAt: row.linked_at };
}

/**
 * Revoke a user's active link — refused while the user still holds a money-capable capability,
 * because that would leave someone able to move money whom the ledger cannot name. Replace the link
 * instead, or remove the capability first. The revoked row is kept: it is evidence of who the user
 * WAS for a period.
 */
export async function revokeUserPersonLink(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string; note: string; revokedBy: string | null },
): Promise<UserPersonLinkRow> {
    const userId = requiredId(args.userId, "user_id");
    const note = requiredNote(args.note);
    const { data, error } = await supabase.rpc("revoke_user_person_link", {
        p_org_id: args.orgId,
        p_user_id: userId,
        p_actor_user_id: args.revokedBy,
        p_note: note,
    });
    if (error) {
        if (/person_link_required_for_money_capability/.test(error.message)) {
            throw new UserPersonLinkError(
                "This user can move money, so their link cannot simply be removed — the ledger must always be able to name them. Replace the link with the correct person, or remove their financial access first.",
                409,
            );
        }
        if (/person_link_not_found/.test(error.message)) throw new UserPersonLinkError("This user has no active link.", 404);
        throw new UserPersonLinkError(error.message, 500);
    }
    return linkRowFrom(data);
}

/**
 * Replace a user's link with another named person, atomically: the old link is revoked and the new
 * one recorded in one transaction, so the user is never unlinked in between. The person is checked
 * exactly as a new link's is.
 */
export async function replaceUserPersonLink(
    supabase: SupabaseClient,
    args: { orgId: string; userId: string; personId: string; note: string; linkedBy: string | null },
): Promise<UserPersonLinkRow> {
    const userId = requiredId(args.userId, "user_id");
    const personId = requiredId(args.personId, "person_id");
    const note = requiredNote(args.note);
    await assertLinkablePerson(supabase, args.orgId, personId);
    const { data, error } = await supabase.rpc("replace_user_person_link", {
        p_org_id: args.orgId,
        p_user_id: userId,
        p_person_id: personId,
        p_actor_user_id: args.linkedBy,
        p_note: note,
    });
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw new UserPersonLinkError("That person is already linked to another account. Revoke or replace that link first.", 409);
        }
        throw new UserPersonLinkError(error.message, 500);
    }
    return linkRowFrom(data);
}

