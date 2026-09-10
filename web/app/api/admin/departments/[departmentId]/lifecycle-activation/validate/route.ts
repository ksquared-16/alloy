import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    departmentIdAllowed,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { validateLifecycleActivationRuntime } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import { gatherParticipantPaperworkFacts } from "@/lib/lifecycle/gatherParticipantPaperworkFacts";
import {
    participantPaperworkReadiness,
    PARTICIPANT_CHECK_ID_BY_READINESS_ID,
} from "@/lib/lifecycle/participantPaperworkReadiness";

/** GET — runtime validation checklist for lifecycle activation. */
export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });
    if (!departmentIdAllowed(dim, departmentId)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const activation = lifecycleActivationFromMetadata(row.metadata);
    if (!activation) {
        return NextResponse.json({
            checks: [],
            error: "No activation bundle saved. Complete the activation wizard first.",
        });
    }

    try {
        const { checks, id_audit } = await validateLifecycleActivationRuntime(
            supabase,
            ctx.orgId,
            departmentId,
            activation,
            dim,
            access.userId
        );
        /*
         * Participant readiness joins the SAME checklist rather than a second surface. The facts
         * come from the owners that hold them; the judging is pure and lives elsewhere.
         */
        const facts = await gatherParticipantPaperworkFacts(supabase, ctx.orgId, row.metadata);
        const participantChecks = facts.noProcess
            ? []
            : participantPaperworkReadiness(facts).map((c) => ({
                  id: PARTICIPANT_CHECK_ID_BY_READINESS_ID[c.id],
                  label: c.label,
                  pass: c.pass,
                  href: "/organization/processes",
                  detail: c.summary,
              }));

        const allChecks = [...checks, ...participantChecks];
        const allPass = allChecks.every((c) => c.pass);
        return NextResponse.json({ checks: allChecks, all_pass: allPass, activation, id_audit });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Validation failed" }, { status: 500 });
    }
}
