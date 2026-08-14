import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { allowListIsImpossible, resolveSearchAccessEnvelope } from "@/lib/search/searchAccessEnvelope";
import { resolvePersonCandidates } from "@/lib/identity/resolveIdentityCandidates";

/**
 * Identity gate for Add Child — read only.
 *
 * The operator UI calls this before offering "create a new child" so an existing
 * sibling record, or a person another workflow already created, is surfaced for
 * reuse. It writes nothing; `child.add` re-runs the same gate server-side, so
 * skipping this route cannot produce a duplicate.
 *
 * @see web/app/api/admin/staff/resolve-person/route.ts — the Staff twin
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: access.status });
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const str = (v: unknown) => (v != null ? String(v).trim() : "");
    const firstName = str(body.first_name);
    const lastName = str(body.last_name);
    const dob = str(body.date_of_birth) || null;
    const customerId = str(body.customer_id);

    if (!firstName && !lastName) {
        return NextResponse.json(
            { error: "Provide at least a name to resolve child identity" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();

    // Household context is part of the QUESTION, so it is subject to the same
    // access boundary as reading that household. A restricted operator must not
    // learn who is in a household they cannot see by asking about a name.
    if (customerId) {
        const envelope = await resolveSearchAccessEnvelope(
            supabase,
            ctx.orgId,
            scopeDimensionsFromAccess(access)
        );
        const unreachable =
            envelope.impossible ||
            (envelope.restricted && allowListIsImpossible(envelope.allowedCustomerIds)) ||
            (envelope.restricted &&
                envelope.allowedCustomerIds !== null &&
                !envelope.allowedCustomerIds.includes(customerId));
        if (unreachable) {
            return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
    }

    const resolution = await resolvePersonCandidates(supabase, ctx.orgId, {
        kind: "child",
        subjectRef: "child_add",
        firstName,
        lastName,
        dob,
        householdCustomerId: customerId || null,
    });

    return NextResponse.json({
        decision: resolution.decision,
        candidates: resolution.candidates,
        /**
         * Advisory for the UI. The server enforces the same rule regardless of
         * what the client does with it.
         */
        create_new_requires_override: resolution.decision === "operator_choice_required",
    });
}
