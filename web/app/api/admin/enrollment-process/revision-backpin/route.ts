/**
 * Establish immutable revision authority over Enrollment journeys that never had one.
 *
 * GET  — the census. Classifies every unpinned journey against the published revision. Writes nothing.
 * POST — the same census, then pins ONLY the journeys it classified `safe_to_pin`.
 *
 * The target revision is never taken from the caller: it is the department's own CURRENT PUBLISHED
 * revision, read here. A caller that could name a revision could pin a journey to configuration it
 * has never run under, which is the reinterpretation this whole path exists to prevent.
 *
 * This is not a stage migration. It writes one column, moves no journey, and changes no status.
 *
 * @see web/lib/process/backPinJourneyRevision.ts
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { BUSINESS_PROCESS_CONFIGURE, requireBusinessProcessCapability } from "@/lib/access/businessProcessAuthority";
import {
    latestPublication,
    loadPublishedConfiguration,
    readDraft,
} from "@/lib/businessProcesses/configuration/businessProcessConfigurationService";
import { backPinJourneyRevision, type RevisionStage } from "@/lib/process/backPinJourneyRevision";

export const dynamic = "force-dynamic";

const PROCESS_KEY = "enrollment";

type PublishedState = {
    revisionId: string;
    stages: RevisionStage[];
    configurationMatchesLive: boolean;
};

/** The department's own published revision, and the stages it froze. */
async function readPublished(orgId: string, departmentId: string): Promise<PublishedState | { error: string }> {
    const supabase = createAdminClient();
    const publication = await latestPublication(supabase, { orgId, departmentId }).catch(() => null);
    const revisionId = (publication?.revisionId ?? "").trim();
    if (!revisionId) {
        return { error: "This department has no published Business Process revision to pin journeys to." };
    }
    // The PUBLISHED configuration — the same payload the revision froze and the runtime projects.
    const payload = (await loadPublishedConfiguration(supabase, { orgId, departmentId }).catch(() => null)) as
        | { processes?: unknown }
        | null;
    const processes = Array.isArray(payload?.processes) ? (payload!.processes as Record<string, unknown>[]) : [];
    const process = processes.find((p) => String(p.key ?? "").trim().toLowerCase() === PROCESS_KEY);
    const stages = Array.isArray(process?.stages) ? (process!.stages as Record<string, unknown>[]) : [];
    return {
        revisionId,
        stages: stages.map((s) => ({
            key: String(s.key ?? ""),
            grain: s.grain == null ? null : String(s.grain),
            is_active: s.is_active !== false,
        })),
        /*
         * The claim that makes back-pinning safe, proven rather than assumed: with nothing
         * unpublished, the live projection these journeys have been running under and the revision
         * payload they would be pinned to are the same configuration. The draft's own base is the
         * published revision precisely when nothing is outstanding.
         */
        configurationMatchesLive: (await readDraft(supabase, { orgId, departmentId }).catch(() => null))?.baseRevisionId === revisionId,
    };
}

async function run(request: NextRequest, dryRun: boolean) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const denied = requireBusinessProcessCapability(ctx, BUSINESS_PROCESS_CONFIGURE);
    if (denied) return denied;

    const departmentId =
        new URL(request.url).searchParams.get("department_id")?.trim()
        || (dryRun ? "" : ((await request.json().catch(() => ({}))) as { department_id?: string }).department_id?.trim() || "");
    if (!departmentId) return NextResponse.json({ error: "department_id is required" }, { status: 400 });

    const published = await readPublished(ctx.orgId, departmentId);
    if ("error" in published) return NextResponse.json({ error: published.error }, { status: 409 });

    const outcome = await backPinJourneyRevision(createAdminClient(), {
        orgId: ctx.orgId,
        processKey: PROCESS_KEY,
        targetRevisionId: published.revisionId,
        stages: published.stages,
        configurationMatchesLive: published.configurationMatchesLive,
        dryRun,
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 500 });
    return NextResponse.json({ ok: true, data: outcome.result });
}

/** The census. Writes nothing, ever. */
export async function GET(request: NextRequest) {
    return run(request, true);
}

/** Pins only what the census classified safe. */
export async function POST(request: NextRequest) {
    return run(request, false);
}
