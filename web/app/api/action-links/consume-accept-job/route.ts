import { NextRequest, NextResponse } from "next/server";
import {
    loadBookingPersonForJobWorkflow,
    loadJobScheduleAndLocationForActionLink,
} from "@/lib/actionLinkDisplayDetails";
import { formatBookingStartForSms, resolveBookingSmsTimeZone } from "@/lib/bookingConfirmationSms";
import { claimActionLink } from "@/lib/actionLinks";
import { emitEvent } from "@/lib/emitEvent";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { executeWorkflowRun } from "@/lib/workflowRun";
import {
    CONTACT_COMPAT_SELECT,
    CUSTOMER_CANONICAL_ADMIN_SELECT,
    OPPORTUNITY_CANONICAL_WORKFLOW_SELECT,
} from "@/lib/fields/canonicalEntitySelectColumns";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_REGEX.test(s);
}

function uuidish(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Copy `locations.address1` → `address_line1` for workflow templates (matches enrichWorkflowEventPayloadEntities). */
function locationWithLineAliases(loc: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!loc) return null;
    const out = { ...loc };
    if (out.address_line1 == null || String(out.address_line1).trim() === "") {
        const a1 = out.address1;
        if (a1 != null && String(a1).trim() !== "") out.address_line1 = a1;
    }
    if (out.address_line2 == null || String(out.address_line2).trim() === "") {
        const a2 = out.address2;
        if (a2 != null && String(a2).trim() !== "") out.address_line2 = a2;
    }
    return out;
}

/** Unrendered workflow placeholders must not be treated as vendor UUIDs. */
function vendorUuidFromMetadata(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || /\{\{/.test(s)) return null;
    return isUuid(s) ? s : null;
}

/**
 * POST /api/action-links/consume-accept-job
 * Body: { token: string } — same raw `action_links.token` as in /action/[token] URL.
 * Resolves vendor: metadata.vendor_id (UUID) else jobs.assigned_vendor_id for entity job.
 * Assigns job, marks link consumed. Single-use.
 */
export async function POST(request: NextRequest) {
    let body: { token?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const token = body.token != null ? String(body.token).trim() : null;
    if (!token) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, expires_at, consumed_at, metadata, org_id")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string | null;
        expires_at: string;
        consumed_at: string | null;
        metadata: unknown;
        org_id?: string | null;
    };

    if (r.consumed_at) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 410 });
    }
    if (r.action_type !== "vendor_accept_job" || r.entity_type !== "job") {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }
    if (!r.entity_id || typeof r.entity_id !== "string") {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }

    const metadata = r.metadata != null && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {};
    const jobId = r.entity_id;

    let vendorId: string | null = vendorUuidFromMetadata(metadata.vendor_id);
    if (!vendorId) {
        const { data: jobRow } = await supabase
            .from("jobs")
            .select("assigned_vendor_id")
            .eq("id", jobId)
            .maybeSingle();
        const av = (jobRow as { assigned_vendor_id?: string | null } | null)?.assigned_vendor_id;
        if (av != null && isUuid(String(av).trim())) {
            vendorId = String(av).trim();
        }
    }
    if (!vendorId) {
        return NextResponse.json({ ok: false, reason: "missing_vendor_id" }, { status: 400 });
    }
    // `RL-32` — claim before the assignment, so ONE atomic write decides who proceeds.
    //
    // The claim deliberately moved ahead of the `jobs` update rather than staying behind it. Both
    // writes are individually atomic, so leaving them in the old order left two independent races
    // that a single request could split: the caller that won the assignment could lose the claim to
    // the caller that lost the assignment, and then neither would run the workflows — the job
    // silently assigned with no vendor notification. Claiming first makes the link the single
    // authority, and everything after this point belongs to exactly one caller.
    //
    // Vendor resolution above is a pure read, so nothing has been changed yet if the claim is lost.
    const now = new Date().toISOString();
    const { claimed } = await claimActionLink(supabase, r.id);
    if (!claimed) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 410 });
    }

    const { data: updatedJob, error: updateErr } = await supabase
        .from("jobs")
        .update({ assigned_vendor_id: vendorId })
        .eq("id", jobId)
        .is("assigned_vendor_id", null)
        .select("id, assigned_vendor_id")
        .maybeSingle();

    if (updateErr) {
        return NextResponse.json({ ok: false, reason: "invalid" }, { status: 500 });
    }

    const accepted = !!updatedJob;
    const acceptResult = accepted ? "accepted" : "already_assigned";

    // Bookkeeping, NOT a gate — the claim above already decided this caller proceeds. A failure to
    // record the outcome must not undo an assignment that has already happened, so it is not fatal.
    const { error: metadataErr } = await supabase
        .from("action_links")
        .update({ metadata: { ...metadata, accept_result: acceptResult } })
        .eq("id", r.id);
    if (metadataErr) {
        console.error("[CONSUME_ACCEPT_JOB] accept_result not recorded", {
            link_id: r.id,
            accept_result: acceptResult,
        });
    }

    let assignedVendorId: string;
    if (updatedJob) {
        assignedVendorId = (updatedJob as { assigned_vendor_id: string }).assigned_vendor_id;
    } else {
        const { data: jobRow } = await supabase
            .from("jobs")
            .select("assigned_vendor_id")
            .eq("id", jobId)
            .single();
        assignedVendorId = (jobRow as { assigned_vendor_id: string } | null)?.assigned_vendor_id ?? vendorId;
    }

    const actionLinkResult = {
        accept_result: acceptResult as "accepted" | "already_assigned",
        job_id: jobId,
        assigned_vendor_id: assignedVendorId,
    };

    /** Same pattern as POST /api/action/[token]/consume: canonical workflow_events + workflow_runs for SMS / follow-ups. */
    if (accepted) {
        const orgId = r.org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;

        const visitCtx = await loadJobScheduleAndLocationForActionLink(supabase, jobId);
        const jobRow = visitCtx.job;
        if (!jobRow) {
            console.error("[CONSUME_ACCEPT_JOB] job missing after accept", { job_id: jobId });
            return NextResponse.json({ ok: false, reason: "invalid", action_link_result: actionLinkResult }, { status: 500 });
        }

        const customerId = uuidish(jobRow.customer_id);
        const opportunityId = uuidish(jobRow.opportunity_id);
        const primaryContactId = uuidish(jobRow.primary_contact_id);

        const [vendorRes, oppRes, customerRes, contactRes, personRow] = await Promise.all([
            supabase.from("vendors").select("*").eq("id", assignedVendorId).maybeSingle(),
            opportunityId
                ? supabase.from("opportunities").select(OPPORTUNITY_CANONICAL_WORKFLOW_SELECT).eq("id", opportunityId).maybeSingle()
                : Promise.resolve({ data: null as null }),
            customerId
                ? supabase.from("customers").select(CUSTOMER_CANONICAL_ADMIN_SELECT).eq("id", customerId).maybeSingle()
                : Promise.resolve({ data: null as null }),
            primaryContactId
                ? supabase.from("contacts").select(CONTACT_COMPAT_SELECT).eq("id", primaryContactId).maybeSingle()
                : Promise.resolve({ data: null as null }),
            loadBookingPersonForJobWorkflow(supabase, jobRow, customerId),
        ]);

        const contactRow = (contactRes as { data: Record<string, unknown> | null }).data;

        const scheduleFromCtx = visitCtx.schedule ? { ...visitCtx.schedule } : null;
        const normalizedSchedule: Record<string, unknown> | null = scheduleFromCtx
            ? scheduleFromCtx
            : jobRow.scheduled_at != null && String(jobRow.scheduled_at).trim() !== ""
              ? {
                    job_id: jobId,
                    org_id: orgId,
                    start_at: jobRow.scheduled_at,
                    end_at: null,
                    timezone: (contactRow as { timezone?: string | null } | null)?.timezone ?? null,
                }
              : null;

        const smsTz = resolveBookingSmsTimeZone({
            scheduleTimezone: (normalizedSchedule as { timezone?: string | null } | null)?.timezone,
            contactTimezone: (contactRow as { timezone?: string | null } | null)?.timezone,
        });
        const startIsoForSms =
            (normalizedSchedule?.start_at != null ? String(normalizedSchedule.start_at) : "") ||
            (jobRow.scheduled_at != null ? String(jobRow.scheduled_at) : "");
        const formattedStartAt = startIsoForSms.trim() ? formatBookingStartForSms(startIsoForSms, smsTz) : "";

        const occurredAt = now;
        const vendorFull = (vendorRes as { data: Record<string, unknown> | null }).data;
        const oppRow = (oppRes as { data: Record<string, unknown> | null }).data;
        const customerRow = (customerRes as { data: Record<string, unknown> | null }).data;
        const locationRow = locationWithLineAliases(visitCtx.location);

        const eventPayload: Record<string, unknown> = {
            event_type: "action_link_consumed",
            occurred_at: occurredAt,
            org_id: orgId,
            action_type: "vendor_accept_job",
            entity_type: "job",
            entity_id: jobId,
            vendor_id: assignedVendorId,
            job: jobRow,
            vendor: vendorFull ?? null,
            schedule: normalizedSchedule,
            location: locationRow,
            opportunity: oppRow ?? null,
            customer: customerRow ?? null,
            contact: contactRow ?? null,
            person: personRow ?? null,
            /** Same alias as book-v2 `booking_confirmed` for templates that reference it. */
            customer_booking_person: personRow ?? null,
            formatted_start_at: formattedStartAt,
        };

        console.log("[CONSUME_ACCEPT_JOB] workflow_payload_hydrated", {
            job_id: jobId,
            vendor_id: assignedVendorId,
            has_schedule: !!normalizedSchedule,
            schedule_id: (normalizedSchedule as { id?: string } | null)?.id ?? null,
            has_location: !!locationRow,
            location_address_line1_set: !!(
                locationRow &&
                String((locationRow as { address_line1?: string }).address_line1 ?? "").trim()
            ),
            has_opportunity: !!oppRow,
            has_customer: !!customerRow,
            has_contact: !!contactRow,
            has_person: !!personRow,
            person_phone_set: !!(personRow && String((personRow as { phone?: string }).phone ?? "").trim()),
            formatted_start_at_len: formattedStartAt.length,
        });

        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: orgId,
                event_type: "action_link_consumed",
                entity_type: "job",
                entity_id: jobId,
                action_type: "vendor_accept_job",
                occurred_at: occurredAt,
                payload: eventPayload,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("[CONSUME_ACCEPT_JOB] emitEvent failed", msg);
            return NextResponse.json(
                { ok: false, reason: "event_emit_failed", message: msg, action_link_result: actionLinkResult },
                { status: 500 }
            );
        }

        let wq = supabase
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "action_link_consumed")
            .eq("entity_type", "job");
        if (orgId) wq = wq.or(`org_id.eq.${orgId},org_id.is.null`);
        const { data: wfs } = await wq;

        for (const wf of wfs ?? []) {
            try {
                await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
                    event_id: eventId,
                    org_id: orgId,
                });
            } catch (err) {
                console.error(
                    "[CONSUME_ACCEPT_JOB] executeWorkflowRun failed",
                    (err as Error).message,
                    "workflow_id=",
                    (wf as { id: string }).id
                );
            }
        }
    }

    return NextResponse.json({
        ok: true,
        action_link_result: actionLinkResult,
    });
}
