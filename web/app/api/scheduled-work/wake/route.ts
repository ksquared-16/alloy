import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { ensureScheduledWorkConsumersRegistered } from "@/lib/scheduledWork/scheduledWorkConsumers";
import { runScheduledWorkWake } from "@/lib/scheduledWork/scheduledWorkRuntime";
import { sweepPendingContactAttempts } from "@/lib/communications/contactAttemptOnProviderAcceptance";
import { sweepUnrealizedEnrollmentFees } from "@/lib/enrollment/financial/realizeEnrollmentFeesForProcessInstance";
import { sweepAbandonedApiUploadsAcrossOrgs } from "@/lib/documents/external/externalDocumentWrites";
import { escalateUnfiledApiUploads } from "@/lib/documents/external/unfiledApiUploadEscalation";
import { makeProcessingCaseDbDeps } from "@/lib/pos/processingCase/processingCaseDb";

export const dynamic = "force-dynamic";

/**
 * THE ONE GENERIC WAKE. The external clock calls this and nothing else.
 *
 * It carries ZERO domain logic: it does not know what billing, aging or autopay
 * are, and it never calls their endpoints. It claims due work and dispatches to
 * registered handlers. Infrastructure that knew which domain to wake would put
 * business cadence in a cron expression, where nobody would think to look for it.
 *
 * ── AUTH IS A MACHINE TOKEN ──
 *
 * `x-cron-token` against `INTERNAL_CRON_TOKEN`, the same mechanism
 * `communication-scheduled-sends/process-due` already uses — one convention for
 * machine callers rather than a second one invented here. There is no session
 * path: this runs as the system across organizations, and an operator-scoped
 * session could only ever do part of the job, which would be worse than refusing.
 *
 * Absent or misconfigured token means 401. A wake endpoint that defaulted open
 * because the environment was missing a variable would be an unauthenticated way
 * to drive every scheduled consequence in the platform.
 */
/**
 * Two accepted machine credentials, and nothing else.
 *
 * `Authorization: Bearer $CRON_SECRET` is what Vercel Cron sends. `x-cron-token`
 * against `INTERNAL_CRON_TOKEN` is the convention this estate already uses for
 * machine callers (`communication-scheduled-sends/process-due`), kept so a
 * deterministic test or an operator recovery can drive a wake without the
 * hosting platform. A missing or empty secret NEVER authorizes: an environment
 * that forgot to set one would otherwise leave every scheduled consequence in the
 * platform drivable by anyone who found the URL.
 */
function isAuthorizedClock(request: NextRequest): boolean {
    const bearerExpected = (process.env.CRON_SECRET ?? "").trim();
    const bearer = (request.headers.get("authorization") ?? "").trim();
    if (bearerExpected && bearer === `Bearer ${bearerExpected}`) return true;

    const tokenExpected = (process.env.INTERNAL_CRON_TOKEN ?? "").trim();
    const token = (request.headers.get("x-cron-token") ?? "").trim();
    return Boolean(tokenExpected && token && token === tokenExpected);
}

async function wake(): Promise<NextResponse> {
    ensureScheduledWorkConsumersRegistered();
    try {
        const supabase = createAdminClient();
        const result = await runScheduledWorkWake(supabase, {});
        // Backstop for contact attempts: accepted messages that declared contact work but were never
        // associated (no webhook configured, provider answered after the send returned).
        let contactAttemptsAssociated = 0;
        try {
            contactAttemptsAssociated = await sweepPendingContactAttempts(supabase);
        } catch {
            contactAttemptsAssociated = 0;
        }
        // Backstop for Enrollment fees: a completed child packet whose fee did not become a charge at
        // completion (a transient failure there is logged, never a failed submit). Same idempotent writer.
        let enrollmentFees: Awaited<ReturnType<typeof sweepUnrealizedEnrollmentFees>> | null = null;
        try {
            enrollmentFees = await sweepUnrealizedEnrollmentFees(supabase);
        } catch {
            enrollmentFees = null;
        }
        // Backstop for D9.2 API uploads: an object a crash left between storage upload and row insert. Only unreferenced
        // objects under <org>/api_uploads/ older than an hour; never a referenced object, another prefix or another org.
        let apiUploadsSwept: Awaited<ReturnType<typeof sweepAbandonedApiUploadsAcrossOrgs>> | null = null;
        try {
            apiUploadsSwept = await sweepAbandonedApiUploadsAcrossOrgs(supabase);
        } catch {
            apiUploadsSwept = null;
        }
        // D9.2: completed API uploads never filed within 24 hours become Processing cases (one per upload, atomic open
        // only — held while that function is absent), and a case whose upload was filed late is closed. Counts only.
        let apiUploadsEscalated: Omit<Awaited<ReturnType<typeof escalateUnfiledApiUploads>>, "outcomes"> | null = null;
        try {
            // This wake's own database clock stamp: the only time a later-wake confirmation may carry (never the app clock).
            const r = await escalateUnfiledApiUploads({ supabase, processing: makeProcessingCaseDbDeps(supabase), wakeClockAt: result.clockRecordedAt });
            apiUploadsEscalated = { scanned: r.scanned, opened: r.opened, existing: r.existing, repaired: r.repaired, held: r.held, skipped: r.skipped, failed: r.failed, resolved: r.resolved, confirmed: r.confirmed, confirm_failed: r.confirm_failed, truncated: r.truncated };
        } catch {
            apiUploadsEscalated = null;
        }
        return NextResponse.json({
            ok: true,
            ...result,
            contact_attempts_associated: contactAttemptsAssociated,
            enrollment_fees: enrollmentFees,
            api_uploads_swept: apiUploadsSwept,
            api_uploads_escalated: apiUploadsEscalated,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : "wake failed";
        return NextResponse.json({ ok: false, error: "WAKE_FAILED", message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAuthorizedClock(request)) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    return wake();
}

/**
 * THE EXTERNAL CLOCK'S ENTRY POINT.
 *
 * Vercel Cron issues a GET carrying `Authorization: Bearer $CRON_SECRET`, so the
 * clock arrives here rather than at POST. Both methods run the same wake through
 * the same runtime — the verb is the hosting platform's convention, not a second
 * behaviour, and giving the scheduler two code paths would mean certifying two.
 *
 * Unauthenticated GET is NOT a liveness endpoint that quietly returns ok. An
 * unauthenticated caller learns only that something is here; it drives nothing.
 */
export async function GET(request: NextRequest) {
    if (!isAuthorizedClock(request)) {
        return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    return wake();
}
