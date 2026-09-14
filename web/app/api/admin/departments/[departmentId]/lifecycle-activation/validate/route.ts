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
import { loadBusinessProcessEditorState } from "@/lib/businessProcesses/configuration/businessProcessEditorState";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
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

        /*
         * What the DRAFT would require, read only so the live answer can name a pending change.
         *
         * These checks judge the published configuration and must keep doing so. But a stage
         * requirement saved and not yet published is invisible to them, and reporting "no paperwork
         * is required" at an administrator who just added some reads as though the save was lost.
         */
        let draftObligationCount = 0;
        try {
            const editorState = await loadBusinessProcessEditorState(supabase, {
                orgId: ctx.orgId,
                departmentId,
                readOnly: true,
            });
            if (editorState) {
                const draftFacts = await gatherParticipantPaperworkFacts(supabase, ctx.orgId, {
                    ...(row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {}),
                    [LIFECYCLE_BUILDER_METADATA_KEY]: editorState.draft_payload,
                });
                draftObligationCount = draftFacts.requirements.length;
            }
        } catch {
            // No draft, or it cannot be read: the live answer below stands on its own.
        }
        const participantChecks = facts.noProcess
            ? []
            : participantPaperworkReadiness({ ...facts, draftObligationCount }).map((c) => ({
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
