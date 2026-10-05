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

import {
    MONEY_CAPABLE_ORG_ROLES,
    personDisplayName,
} from "@/lib/financials/identity/financialActorIdentity";

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
};

export type UnresolvedActor = {
    userId: string;
    roles: string[];
};

export type UserPersonLinkState = {
    /** Active links in this organisation, so an administrator sees what is already decided. */
    links: UserPersonLinkRow[];
    /**
     * Users holding a role that can create financial activity and carrying no active link.
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
    const links = ((linkRows ?? []) as Array<{
        id: string; user_id: string; person_id: string; status: string; linked_at: string | null;
    }>).map((r) => ({
        id: r.id, userId: r.user_id, personId: r.person_id, status: r.status, linkedAt: r.linked_at,
    }));
    const linkedUserIds = new Set(links.map((l) => l.userId));

    const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("org_id", orgId)
        .in("role", [...MONEY_CAPABLE_ORG_ROLES]);
    if (roleError) throw new UserPersonLinkError(roleError.message, 500);
    const rolesByUser = new Map<string, string[]>();
    for (const row of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
        const existing = rolesByUser.get(row.user_id) ?? [];
        existing.push(row.role);
        rolesByUser.set(row.user_id, existing);
    }

    const { data: personRows, error: personError } = await supabase
        .from("persons")
        .select("id, full_name, first_name, last_name, archived_at")
        .eq("org_id", orgId)
        .is("archived_at", null);
    if (personError) throw new UserPersonLinkError(personError.message, 500);
    const linkCandidates: Array<{ personId: string; name: string }> = [];
    for (const row of (personRows ?? []) as Array<{
        id: string; full_name: string | null; first_name: string | null; last_name: string | null;
    }>) {
        const name = personDisplayName(row);
        /* An unnamed person cannot satisfy the requirement, so offering one would be a dead end. */
        if (name) linkCandidates.push({ personId: row.id, name });
    }

    return {
        links,
        unresolvedMoneyCapableActors: [...rolesByUser.entries()]
            .filter(([userId]) => !linkedUserIds.has(userId))
            .map(([userId, roles]) => ({ userId, roles: [...new Set(roles)].sort() })),
        linkCandidates,
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
