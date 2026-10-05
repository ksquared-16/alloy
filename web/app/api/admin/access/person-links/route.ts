import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    ADMIN_USERS_READ,
    ADMIN_USERS_WRITE,
    requireAccessAdministration,
} from "@/lib/admin/canManageUsersAndRoles";
import {
    createUserPersonLink,
    listUserPersonLinkState,
    UserPersonLinkError,
} from "@/lib/access/userPersonLinkService";

export const dynamic = "force-dynamic";

/**
 * THE EXPLICIT ACT THE IDENTITY BRIDGE WAS ALWAYS DESIGNED FOR, AND WHICH NOTHING PERFORMED.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS HERE RATHER THAN IN FINANCIALS ──
 *
 * `user_person_links` has been the canonical bridge from an authenticated user to the human they are
 * since September 2026. Its migration is emphatic that "linking is an explicit, recorded, revocable
 * act or it does not happen" — and then nothing in the product performed that act. A repository-wide
 * search found exactly one reader (`resolveLinkedPersonId`) and ZERO writers. The table has been
 * empty on the deployed estate ever since: the census measured 13 users holding a money-capable org
 * role and 0 links of any status.
 *
 * W7-F002 is where that became load-bearing. The Director's decision is that a user permitted to
 * create financial activity must resolve to a recognisable human for the financial audit trail, and
 * "Created by a person whose name is not on file" is not acceptable attribution for money. Financials
 * can state that requirement, read it and show the gap — and it did, in
 * `lib/financials/identity/financialActorIdentity.ts`. It cannot CLOSE the gap, because closing it
 * means deciding which human an account belongs to, and that decision is Access's.
 *
 * So this is deliberately the smallest possible addition to Access and nothing more: one GET that
 * says who is unresolved, and one POST that records a link an administrator explicitly named. It
 * introduces no identity model, no invitation flow, no account lifecycle and no operator UI — those
 * remain cross-lane Identity/Access work, surfaced rather than quietly built here.
 *
 * ── IDENTITY IS NEVER INFERRED, AND THIS ROUTE CANNOT INFER ONE ──
 *
 * Both ids are REQUIRED in the body. There is no "match by email", no "best candidate", no implicit
 * resolution of any kind — the tempting shortcut `persons.email = auth.users.email` is refused here
 * for the reasons the table's own migration gives: email is mutable, unique by no constraint in this
 * schema, and shared in practice. A wrong link either locks out a real teacher or puts one person's
 * name on another person's financial act, and neither failure announces itself.
 *
 * `note` is required for the same reason the column exists: an identity decision with no recorded
 * reason is one nobody can review later.
 *
 * ── AUTHORITY IS ACCESS'S OWN, NOT A NEW ONE ──
 *
 * `requireAccessAdministration` is the gate every Access mutation route already uses, and the
 * capability is the one for managing users. Reading who is unresolved takes the read capability;
 * recording a link takes the write capability — the same split the rest of this namespace uses. The
 * table's RLS additionally restricts writes to owner and admin, so `ops` can run the day without
 * deciding who anyone is.
 */

export async function GET() {
    const auth = await requireAccessAdministration(ADMIN_USERS_READ);
    if (!auth.ok) return auth.response;
    const { orgId } = auth.access;

    try {
        const state = await listUserPersonLinkState(createAdminClient(), { orgId });
        return NextResponse.json({ ok: true, ...state });
    } catch (error) {
        const status = error instanceof UserPersonLinkError ? error.status : 500;
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Could not read identity links." },
            { status },
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireAccessAdministration(ADMIN_USERS_WRITE);
    if (!auth.ok) return auth.response;
    const { orgId, userId } = auth.access;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ ok: false, error: "A JSON body is required." }, { status: 400 });
    }

    try {
        const link = await createUserPersonLink(createAdminClient(), {
            orgId,
            /* Both named explicitly. Nothing here resolves either from the other. */
            userId: typeof body.user_id === "string" ? body.user_id : "",
            personId: typeof body.person_id === "string" ? body.person_id : "",
            note: typeof body.note === "string" ? body.note : "",
            linkedBy: userId ?? null,
        });
        return NextResponse.json({ ok: true, link });
    } catch (error) {
        const status = error instanceof UserPersonLinkError ? error.status : 500;
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Could not record the link." },
            { status },
        );
    }
}
