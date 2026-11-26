/**
 * Identity gate for Add Staff — read only.
 *
 * The operator UI calls this before offering "create new person" so an existing
 * parent, former employee, or person created by another workflow is surfaced
 * for reuse. It writes nothing; `staff.add` re-runs the same gate server-side,
 * so skipping this route cannot produce a duplicate.
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveStaffPersonCandidates } from "@/lib/staff/resolveStaffPersonCandidates";

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        body = {};
    }

    const str = (v: unknown) => (v != null ? String(v).trim() : "");
    const firstName = str(body.first_name);
    const lastName = str(body.last_name);
    const email = str(body.email);
    const phone = str(body.phone);

    if (!firstName && !lastName && !email && !phone) {
        return NextResponse.json(
            { error: "Provide at least a name, email, or phone to resolve identity" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    const resolution = await resolveStaffPersonCandidates(supabase, ctx.orgId, {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
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
