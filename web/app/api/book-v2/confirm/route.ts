import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { ensureCustomerForPersonNative, resolveOrCreatePersonCustomerForBooking } from "@/lib/bookingPersonCustomerResolve";
import { ensureCanonicalBookingLocation } from "@/lib/bookingLocations";
import {
    homeTypeInputToStableKey,
    parseBathroomsForCjd,
    parseBedsFromBody,
    parseRoomCount,
    splitBookV2LocationAccess,
    uiAccessMethodToStableKey,
} from "@/lib/book-v2/bookingCanonicalMaps";
import { loadSqftTiersForVertical, normalizeSqftKeyInput } from "@/lib/book-v2/loadCleaningPricingCatalog";
import { upsertCleaningJobDetailsFromBookV2 } from "@/lib/book-v2/upsertCleaningJobDetails";
import {
    BOOKED_PIPELINE_STAGE_ID,
    BOOKING_CONFIRM_JOB_STATUS_ID,
    BOOKING_CONFIRM_JOB_STATUS_KEY,
    BOOKING_CONFIRM_JOB_STATUS_RESOLVE_KEYS,
    BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
    BOOKING_CONFIRM_SCHEDULE_STATUS_ID,
    BOOKING_CONFIRM_SCHEDULE_STATUS_KEY,
} from "@/lib/book-v2/bookingConstants";
import { resolvePipelineStageIdByOrgKey, pipelineStageEnvFallback } from "@/lib/book-v2/resolvePipelineStage";
import { resolveBookingJobStatus } from "@/lib/book-v2/resolveBookingJobStatus";
import { resolveScheduleStatusRowByKey } from "@/lib/admin/scheduleEffectiveStatusKey";
import { persistBookingPaymentMethod, resolveStripePaymentMethodId } from "@/lib/book-v2/persistBookingPaymentMethod";
import { formatBookingStartForSms, resolveBookingSmsTimeZone } from "@/lib/bookingConfirmationSms";
import { formatMoneyFromCents } from "@/lib/adminFormatters";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { loadPublicBookingFieldDefRows } from "@/lib/fields/loadPublicBookingFieldDefs";
import { upsertConfigurableFieldValuesForEntity } from "@/lib/fields/upsertConfigurableFieldValues";
import { initializeJobPricing } from "@/lib/pricing/initializeJobPricing";
import { executeWorkflowRun } from "@/lib/workflowRun";

type Supabase = ReturnType<typeof createServiceRoleClient>;

function perfMs(start: number): number {
    return Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);
}

function bookV2PerfLog(phase: string, start: number, bookingAttemptId: string | null, extra?: string) {
    const suffix = extra ? ` ${extra}` : "";
    console.log(
        `[BOOK_V2_PERF] confirm phase=${phase} duration_ms=${perfMs(start)} booking_attempt_id=${bookingAttemptId ?? "none"}${suffix}`
    );
}

const CONFIRM_SAFE_PAYLOAD_KEYS = ["org_id", "person_id", "customer_id", "first_name", "last_name", "email", "phone", "status", "name", "vertical_id", "metadata"] as const;

function confirmSafePayload(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of CONFIRM_SAFE_PAYLOAD_KEYS) {
        if (obj[k] !== undefined) out[k] = obj[k];
    }
    return out;
}

function logAndThrowConfirmError(context: string, err: unknown, payload: Record<string, unknown>): never {
    const e = err as { message?: string; code?: string; details?: string; hint?: string } | null;
    const msg = e?.message ?? "unknown";
    const code = e?.code ?? "unknown";
    const detail = {
        error_message: e?.message,
        error_code: e?.code,
        error_details: e?.details,
        error_hint: e?.hint,
        payload: confirmSafePayload(payload),
    };
    console.error(`[BOOK_V2_CONFIRM] ${context}`, detail);
    throw new Error(`Confirm ${context}: ${msg} (code: ${code})`);
}

function isIdempotentDiscountRetry(
    existingBookingAttemptId: string | null | undefined,
    currentBookingAttemptId: string | null
): boolean {
    return !!(
        currentBookingAttemptId &&
        existingBookingAttemptId &&
        existingBookingAttemptId === currentBookingAttemptId
    );
}

function normConfirmEmail(v: unknown): string {
    return String(v ?? "").trim().toLowerCase();
}

function normConfirmPhoneDigits(v: unknown): string {
    return String(v ?? "").replace(/\D/g, "");
}

function normConfirmNamePart(v: unknown): string {
    return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Prefer confirm body; then `metadata.book_v2_service_property`; then prior `quote_input`. */
function pickServiceDetail(bodyVal: unknown, svcVal: unknown, quoteInputVal: unknown): unknown {
    if (bodyVal != null && String(bodyVal).trim() !== "") return bodyVal;
    if (svcVal != null && svcVal !== "") {
        if (typeof svcVal === "number" && !Number.isNaN(svcVal)) return String(svcVal);
        if (typeof svcVal === "string" && svcVal.trim()) return svcVal;
    }
    if (quoteInputVal != null && String(quoteInputVal).trim() !== "") return quoteInputVal;
    return null;
}

/** Configurable field bag from confirm body (property fields often live only here, not top-level). */
function pickBookV2PropertyField(bodyVal: unknown, cfgVal: unknown, svcVal: unknown, quoteInputVal: unknown): unknown {
    if (bodyVal != null && String(bodyVal).trim() !== "") return bodyVal;
    if (cfgVal != null && String(cfgVal).trim() !== "") return cfgVal;
    return pickServiceDetail(null, svcVal, quoteInputVal);
}

type ConfirmIdentityRow = {
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
};

/**
 * True when the person row linked to the quote matches what the user submitted.
 * If the browser sends stale person_id/opportunity_id after the user edits name/email/phone,
 * this returns false so confirm falls back to person-native resolution.
 */
function identityRowMatchesSubmission(row: ConfirmIdentityRow, submitted: { email: string; phone: string; first: string; last: string }): boolean {
    const se = normConfirmEmail(submitted.email);
    const re = normConfirmEmail(row.email);
    if (se && re && se !== re) return false;
    if (re && !se) return false;

    const sp = normConfirmPhoneDigits(submitted.phone);
    const rp = normConfirmPhoneDigits(row.phone);
    if (sp.length >= 10 && rp.length >= 10 && sp.slice(-10) !== rp.slice(-10)) return false;
    if (rp.length >= 10 && sp.length < 10) return false;

    const sf = normConfirmNamePart(submitted.first);
    const sl = normConfirmNamePart(submitted.last);
    const rf = normConfirmNamePart(row.first_name);
    const rl = normConfirmNamePart(row.last_name);
    if (sf && sl && rf && rl && (sf !== rf || sl !== rl)) return false;

    return true;
}

async function quoteLinkedIdentityMatchesSubmission(
    supabase: Supabase,
    params: {
        person_id: string | null | undefined;
        contact_email: unknown;
        contact_phone: unknown;
        contact_first_name: unknown;
        contact_last_name: unknown;
    }
): Promise<boolean> {
    const { person_id, contact_email, contact_phone, contact_first_name, contact_last_name } = params;
    const submitted = {
        email: String(contact_email ?? "").trim(),
        phone: String(contact_phone ?? "").trim(),
        first: String(contact_first_name ?? "").trim(),
        last: String(contact_last_name ?? "").trim(),
    };

    if (!person_id || typeof person_id !== "string") {
        return true;
    }

    const { data: p } = await supabase.from("persons").select("email, phone, first_name, last_name").eq("id", person_id).maybeSingle();
    const row = (p as ConfirmIdentityRow | null) ?? null;
    if (!row) return false;
    return identityRowMatchesSubmission(row, submitted);
}

/** Returns a NextResponse to send if the customer already redeemed this promo, or null if OK. */
async function assertNoPriorDiscountRedemption(
    supabase: Supabase,
    params: {
        customerId: string;
        discount_code_id: string | null;
        discount_program_id: string | null;
        booking_attempt_id: string | null;
    }
): Promise<NextResponse | null> {
    const { customerId, discount_code_id, discount_program_id, booking_attempt_id } = params;
    const attempt = booking_attempt_id ?? null;

    const programQ = discount_program_id
        ? supabase
              .from("discount_redemptions")
              .select("id, booking_attempt_id")
              .eq("discount_program_id", discount_program_id)
              .eq("customer_id", customerId)
              .limit(1)
              .maybeSingle()
        : Promise.resolve({ data: null, error: null as null });
    const codeQ = discount_code_id
        ? supabase
              .from("discount_redemptions")
              .select("id, booking_attempt_id")
              .eq("discount_code_id", discount_code_id)
              .eq("customer_id", customerId)
              .limit(1)
              .maybeSingle()
        : Promise.resolve({ data: null, error: null as null });

    const [{ data: existingProgram, error: errProg }, { data: existingCode, error: errCode }] = await Promise.all([programQ, codeQ]);

    if (discount_program_id) {
        if (errProg) {
            return NextResponse.json(
                { ok: false, message: "Failed to check discount usage", booking_attempt_id: attempt },
                { status: 500 }
            );
        }
        if (
            existingProgram &&
            !isIdempotentDiscountRetry(
                (existingProgram as { booking_attempt_id?: string | null }).booking_attempt_id,
                booking_attempt_id
            )
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "That promo code has already been used for this customer.",
                    reason: "discount_already_used",
                    booking_attempt_id: attempt,
                },
                { status: 409 }
            );
        }
    }

    if (discount_code_id) {
        if (errCode) {
            return NextResponse.json(
                { ok: false, message: "Failed to check discount usage", booking_attempt_id: attempt },
                { status: 500 }
            );
        }
        if (
            existingCode &&
            !isIdempotentDiscountRetry(
                (existingCode as { booking_attempt_id?: string | null }).booking_attempt_id,
                booking_attempt_id
            )
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "That promo code has already been used for this customer.",
                    reason: "discount_already_used",
                    booking_attempt_id: attempt,
                },
                { status: 409 }
            );
        }
    }

    return null;
}

/** Deferred: workflow_events insert + booking_confirmed workflow runs (does not block HTTP response). Payment persists synchronously before this. */
async function runDeferredBookingEffects(params: {
    booking_attempt_id: string | null;
    jobId: string;
    opportunityId: string;
    scheduleId: string;
    customerId: string;
    personIdFromQuote: string | null;
    slot_start: string;
    slot_end: string;
    timezone: string;
}): Promise<void> {
    const {
        booking_attempt_id,
        jobId,
        opportunityId,
        scheduleId,
        customerId,
        personIdFromQuote,
        slot_start,
        slot_end,
        timezone,
    } = params;
    const tDeferred = typeof performance !== "undefined" ? performance.now() : Date.now();
    const supa = createServiceRoleClient();
    const orgIdForWorkflows = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
    const bookedStageIdForEvent =
        (await resolvePipelineStageIdByOrgKey(supa, orgIdForWorkflows, "booked")) ??
        pipelineStageEnvFallback("booked") ??
        BOOKED_PIPELINE_STAGE_ID;

    try {
        let workflowQuery = supa
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "booking_confirmed")
            .eq("entity_type", "job");
        if (orgIdForWorkflows) {
            workflowQuery = workflowQuery.or(`org_id.eq.${orgIdForWorkflows},org_id.is.null`);
        }
        const tWfQuery = typeof performance !== "undefined" ? performance.now() : Date.now();
        const { data: bookingWorkflows } = await workflowQuery;
        bookV2PerfLog("deferred_workflow_list_query", tWfQuery, booking_attempt_id, `count=${bookingWorkflows?.length ?? 0}`);

        if (!bookingWorkflows?.length) {
            return;
        }

        const tHydrate = typeof performance !== "undefined" ? performance.now() : Date.now();
        const [jobRes, oppRes, customerRes, scheduleRes, personRes, cjdRes] = await Promise.all([
            supa.from("jobs").select("*").eq("id", jobId).single(),
            supa.from("opportunities").select("*").eq("id", opportunityId).single(),
            supa.from("customers").select("*").eq("id", customerId).single(),
            supa.from("schedules").select("*").eq("id", scheduleId).single(),
            personIdFromQuote
                ? supa.from("persons").select("id, first_name, last_name, email, phone").eq("id", personIdFromQuote).maybeSingle()
                : Promise.resolve({ data: null as null }),
            supa.from("cleaning_job_details").select("beds, baths, square_footage_tier_key").eq("job_id", jobId).maybeSingle(),
        ]);
        bookV2PerfLog("deferred_payload_hydrate_parallel", tHydrate, booking_attempt_id);

        const jobRow = jobRes.data;
        const oppRow = oppRes.data;
        const customerRow = customerRes.data;
        const scheduleRow = scheduleRes.data;
        let personRow = (personRes as { data: Record<string, unknown> | null }).data as Record<string, unknown> | null;

        const jobPrimaryPersonId = (jobRow as { primary_person_id?: string | null } | null)?.primary_person_id ?? null;
        if (!personRow && jobPrimaryPersonId) {
            const { data: p } = await supa
                .from("persons")
                .select("id, first_name, last_name, email, phone")
                .eq("id", jobPrimaryPersonId)
                .maybeSingle();
            personRow = p as Record<string, unknown> | null;
        }

        const normalizedSchedule =
            scheduleRow ??
            ({
                id: scheduleId,
                start_at: slot_start,
                end_at: slot_end,
                timezone,
                duration_minutes: 120,
                created_at: new Date().toISOString(),
            } as Record<string, unknown>);

        /** Person is canonical for workflows; `contact` is legacy-only (always null for book-v2). */
        const eventPayload: Record<string, unknown> = {
            event_type: "booking_confirmed",
            /** Required for event-driven workflow validation (normalizeEntityType → jobs). */
            entity_type: "job",
            entity_id: jobId,
            occurred_at: new Date().toISOString(),
            org_id: orgIdForWorkflows,
            booked_stage_id: bookedStageIdForEvent,
            job: jobRow ?? null,
            contact: null,
            person: personRow ?? null,
            customer_booking_person: personRow ?? null,
            customer: customerRow ?? null,
            opportunity: oppRow ?? null,
            schedule: normalizedSchedule,
        };

        const schedForSms = normalizedSchedule as { id?: string; start_at?: string | null; timezone?: string | null };
        const smsTz = resolveBookingSmsTimeZone({
            scheduleTimezone: schedForSms.timezone,
            contactTimezone: null,
        });
        const startIsoForSms = (schedForSms.start_at as string | undefined) ?? slot_start;
        eventPayload.formatted_start_at = formatBookingStartForSms(startIsoForSms, smsTz);

        const cjdRow = (cjdRes as {
            data: { beds?: number | null; baths?: number | null; square_footage_tier_key?: string | null } | null;
        }).data;
        const jobForPrice = jobRow as { gross_price_cents?: number | null; estimated_total_cents?: number | null } | null;
        const priceCents = jobForPrice?.gross_price_cents ?? jobForPrice?.estimated_total_cents ?? null;
        eventPayload.booking_price =
            priceCents != null && typeof priceCents === "number" && !Number.isNaN(priceCents) ? formatMoneyFromCents(priceCents) : "";
        eventPayload.booking_bedrooms =
            cjdRow != null && cjdRow.beds != null && !Number.isNaN(Number(cjdRow.beds)) ? String(cjdRow.beds) : "";
        eventPayload.booking_bathrooms =
            cjdRow != null && cjdRow.baths != null && !Number.isNaN(Number(cjdRow.baths)) ? String(cjdRow.baths) : "";
        let bookingSqftStr = "";
        if (cjdRow != null && cjdRow.square_footage_tier_key != null && String(cjdRow.square_footage_tier_key).trim() !== "") {
            bookingSqftStr = String(cjdRow.square_footage_tier_key).trim();
        } else {
            const oppM = (oppRow as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
            const qi = (oppM.quote_input as Record<string, unknown> | undefined) ?? {};
            const rawSq = qi.square_footage;
            bookingSqftStr =
                typeof rawSq === "string" ? rawSq.trim() : rawSq != null ? String(rawSq).trim() : "";
        }
        eventPayload.booking_square_footage = bookingSqftStr;

        const j = jobRow as { status_key?: unknown; id?: string } | null;
        const s = normalizedSchedule as { status_key?: unknown; id?: string };
        console.log("[BOOK_V2_CONFIRM_EVENT_PAYLOAD]", {
            booking_attempt_id,
            job_id: jobId,
            schedule_id: scheduleId,
            event_type: "booking_confirmed",
            entity_type: eventPayload.entity_type,
            job_status_key: j?.status_key ?? null,
            schedule_status_key: s?.status_key ?? null,
            has_person: !!personRow,
            person_phone_set: !!(personRow && String((personRow as { phone?: string }).phone ?? "").trim()),
        });

        const tEmit = typeof performance !== "undefined" ? performance.now() : Date.now();
        let eventId: string | null = null;
        try {
            eventId = await emitEvent({
                org_id: orgIdForWorkflows,
                event_type: "booking_confirmed",
                entity_type: "job",
                entity_id: jobId,
                action_type: null,
                occurred_at: eventPayload.occurred_at as string,
                payload: eventPayload,
            });
        } catch (emitErr: unknown) {
            console.error("[BOOK_V2_CONFIRM_EMIT_EVENT]", emitErr);
        }
        bookV2PerfLog("deferred_emit_event", tEmit, booking_attempt_id);

        const tRuns = typeof performance !== "undefined" ? performance.now() : Date.now();
        await Promise.all(
            bookingWorkflows.map((wf) =>
                executeWorkflowRun(supa, wf.id, eventPayload, {
                    event_id: eventId ?? null,
                    org_id: orgIdForWorkflows,
                })
                    .then((runResult) => {
                        console.log(
                            `[BOOK_V2_CONFIRM_WORKFLOW] workflow_id=${wf.id} run_id=${runResult.workflow_run_id} status=${runResult.status}`
                        );
                    })
                    .catch((wfErr: unknown) => {
                        console.error("[BOOK_V2_CONFIRM_WORKFLOW_ERROR]", wf.id, wfErr);
                    })
            )
        );
        bookV2PerfLog("deferred_workflow_runs_parallel", tRuns, booking_attempt_id, `n=${bookingWorkflows.length}`);
    } catch (e) {
        console.error("[BOOK_V2_PERF] deferred_booking_effects_failed booking_attempt_id=", booking_attempt_id, e);
    }
    bookV2PerfLog("deferred_total", tDeferred, booking_attempt_id);
}

/**
 * Recover canonical person id: body person → customer_persons (by customer) → opportunity.primary_person_id.
 * Booking does not use contacts for this path.
 */
async function resolvePrimaryPersonIdForConfirm(
    supabase: Supabase,
    params: { personId: string | null; customerId: string; opportunityId: string }
): Promise<string | null> {
    const trim = (s: string | null | undefined): string | null =>
        typeof s === "string" && s.trim() ? s.trim() : null;

    let pid = trim(params.personId);
    if (pid) return pid;

    const { data: cpRows } = await supabase
        .from("customer_persons")
        .select("person_id, is_primary")
        .eq("customer_id", params.customerId)
        .limit(24);
    const rows = cpRows ?? [];
    const ordered = [...rows].sort((a, b) => Number(!!(b as { is_primary?: boolean }).is_primary) - Number(!!(a as { is_primary?: boolean }).is_primary));
    for (const r of ordered) {
        pid = trim((r as { person_id?: string | null }).person_id ?? null);
        if (pid) return pid;
    }

    const { data: oppRow } = await supabase
        .from("opportunities")
        .select("primary_person_id")
        .eq("id", params.opportunityId)
        .maybeSingle();
    pid = trim((oppRow as { primary_person_id?: string | null } | null)?.primary_person_id ?? null);
    if (pid) return pid;

    return null;
}

/**
 * Normalize frequency label to service_frequency_key
 */
function normalizeFrequencyKey(frequencyLabel: string | null | undefined): string {
    if (!frequencyLabel) return "one_time";

    const normalized = frequencyLabel.toLowerCase().trim();

    // Map common frequency labels to canonical keys
    if (normalized.includes("one-time") || normalized.includes("one time") || normalized === "one-time") {
        return "one_time";
    }
    // MUST run before generic "weekly": "bi-weekly".includes("weekly") is true
    if (normalized.includes("bi-weekly") || normalized.includes("biweekly") || normalized.includes("every 2 weeks")) {
        return "biweekly";
    }
    if (normalized === "weekly" || normalized.includes("weekly")) {
        return "weekly";
    }
    if (normalized.includes("monthly") || normalized === "monthly") {
        return "monthly";
    }
    if (normalized.includes("quarterly") || normalized === "quarterly") {
        return "quarterly";
    }

    return "one_time";
}

/** Map service_frequency_key to customer_subscriptions cadence + interval. Returns null for one_time. */
function getCadenceIntervalFromServiceFrequencyKey(
    service_frequency_key: string
): { cadence: "week" | "month"; interval: number } | null {
    const k = (service_frequency_key ?? "").toLowerCase().trim();
    if (k === "one_time" || !k) return null;
    if (k === "weekly") return { cadence: "week", interval: 1 };
    if (k === "biweekly") return { cadence: "week", interval: 2 };
    if (k === "monthly") return { cadence: "month", interval: 1 };
    if (k === "quarterly") return { cadence: "month", interval: 3 };
    return null;
}

/**
 * POST /api/book-v2/confirm
 * 
 * Creates/updates Opportunity, Job, and Schedule records in Supabase.
 * Fully idempotent with contact/customer deduplication.
 * 
 * Body:
 * - slot_start: ISO timestamp string
 * - slot_end: ISO timestamp string
 * - timezone: IANA timezone string
 * - quote_subtotal: number
 * - discount_amount: number (optional)
 * - quote_total: number
 * - discount_code_id: string | null (optional; legacy discount_codes row)
 * - discount_program_id: string | null (optional; discount_programs row — either this or discount_code_id when discounted)
 * - contact_email: string
 * - contact_phone: string
 * - contact_first_name: string (optional)
 * - contact_last_name: string (optional)
 * - address: string (optional)
 * - city: string (optional)
 * - bedrooms: string (optional)
 * - bathrooms: string (optional)
 * - access_method: string (optional)
 * - access_note: string (optional)
 * - additional_notes: string (optional)
 * - frequency_label: string (optional, defaults to "One-time")
 * - first_clean_price: number (optional; used for jobs.estimated_total_cents when provided)
 * - recurring_price: number (optional; used for jobs.recurring_total_cents when recurring)
 * - quote_input: object (optional; persisted to opportunity.metadata.quote_input)
 * - quote_output: object (optional; persisted to opportunity.metadata.quote_output)
 * - stripe_payment_method_id: string (optional; pm_… from successful confirmCardSetup — persists default card + customer_payment_methods)
 * - stripe_setup_intent_id: string (optional; seti_… for customers.setup_intent_id denorm)
 */
export async function POST(request: NextRequest) {
    let bookingAttemptId: string | null = null;
    try {
        const body = await request.json();
        bookingAttemptId = body.booking_attempt_id ?? null;
        const {
            slot_start,
            slot_end,
            timezone,
            quote_subtotal,
            discount_amount = 0,
            quote_total,
            discount_code_id = null,
            discount_program_id: discount_program_id_raw = null,
            discount_code = null,
            contact_email,
            contact_phone,
            contact_first_name,
            contact_last_name,
            address,
            city,
            state,
            postal_code,
            home_type,
            bedrooms,
            bathrooms,
            configurable_field_values: configurable_field_values_body,
            access_method,
            access_note,
            additional_notes,
            has_pets: has_pets_body,
            frequency_label = "One-time",
            first_clean_price,
            recurring_price,
            quote_input,
            quote_output,
            booking_attempt_id = bookingAttemptId,
            stripe_payment_method_id: stripe_pm_body,
            stripe_setup_intent_id: stripe_si_body,
            payment_method_id: payment_method_id_body,
        } = body;

        let opportunity_id_from_quote =
            typeof body.opportunity_id === "string" && body.opportunity_id.trim() ? body.opportunity_id.trim() : null;
        let person_id_from_quote =
            typeof body.person_id === "string" && body.person_id.trim() ? body.person_id.trim() : null;
        let customer_id_from_quote =
            typeof body.customer_id === "string" && body.customer_id.trim() ? body.customer_id.trim() : null;

        const stripe_payment_method_id =
            (typeof stripe_pm_body === "string" && stripe_pm_body.trim().startsWith("pm_") ? stripe_pm_body.trim() : null) ??
            (typeof payment_method_id_body === "string" && payment_method_id_body.trim().startsWith("pm_")
                ? payment_method_id_body.trim()
                : null);
        const stripe_setup_intent_id =
            typeof stripe_si_body === "string" && stripe_si_body.trim() ? stripe_si_body.trim() : null;

        console.log(
            `[BOOKING_PAYMENT_METHOD] confirm body pm_present=${!!stripe_payment_method_id} si_present=${!!stripe_setup_intent_id} booking_attempt_id=${booking_attempt_id ?? "none"}`
        );
        console.log(
            `[BOOKING_PAYMENT_METHOD] confirm body key/type pm_key_in_json=${Object.prototype.hasOwnProperty.call(body, "stripe_payment_method_id")} si_key_in_json=${Object.prototype.hasOwnProperty.call(body, "stripe_setup_intent_id")} pm_type=${typeof stripe_pm_body} si_type=${typeof stripe_si_body}`
        );

        const discount_program_id =
            typeof discount_program_id_raw === "string" && discount_program_id_raw.trim()
                ? discount_program_id_raw.trim()
                : null;

        const service_frequency_key = normalizeFrequencyKey(frequency_label);
        const is_recurring = service_frequency_key !== "one_time";
        const firstCleanCents = typeof first_clean_price === "number" && first_clean_price > 0
            ? Math.round(first_clean_price * 100)
            : null;
        const quoteOutForRecurring =
            quote_output != null && typeof quote_output === "object" ? (quote_output as Record<string, unknown>) : null;
        const recurringPriceNumeric =
            typeof recurring_price === "number" && recurring_price > 0
                ? recurring_price
                : quoteOutForRecurring != null &&
                    typeof quoteOutForRecurring.recurring_price === "number" &&
                    Number(quoteOutForRecurring.recurring_price) > 0
                  ? Number(quoteOutForRecurring.recurring_price)
                  : null;
        const recurringCents =
            is_recurring && recurringPriceNumeric != null && recurringPriceNumeric > 0
                ? Math.round(recurringPriceNumeric * 100)
                : null;
        const quoteSubtotalCentsForJob =
            quote_subtotal != null && Number.isFinite(Number(quote_subtotal)) ? Math.round(Number(quote_subtotal) * 100) : null;
        const quoteTotalCentsForJob =
            quote_total != null && Number.isFinite(Number(quote_total)) ? Math.round(Number(quote_total) * 100) : null;
        /** Net amount for first visit (post-discount when quote_total is discounted). */
        const netFirstVisitCents = quoteTotalCentsForJob ?? firstCleanCents ?? quoteSubtotalCentsForJob;
        /** List / subtotal before one-time promo (for job.gross_price_cents + admin display). */
        const grossFirstVisitCents = quoteSubtotalCentsForJob ?? firstCleanCents ?? quoteTotalCentsForJob;
        const hasPetsResolved =
            has_pets_body === true || has_pets_body === "true" || has_pets_body === 1
                ? true
                : has_pets_body === false || has_pets_body === "false" || has_pets_body === 0
                  ? false
                  : null;
        const cfgBag: Record<string, unknown> =
            configurable_field_values_body != null && typeof configurable_field_values_body === "object"
                ? (configurable_field_values_body as Record<string, unknown>)
                : {};
        console.log(
            "[BOOK_V2_CONFIRM_START] booking_attempt_id=%s email=%s phone=%s slot_start=%s slot_end=%s frequency_label=%s service_frequency_key=%s discount_code_id=%s discount_program_id=%s discount_code=%s discount_amount=%s",
            booking_attempt_id ?? "None",
            contact_email ?? "None",
            contact_phone ?? "None",
            slot_start ?? "None",
            slot_end ?? "None",
            frequency_label ?? "None",
            service_frequency_key,
            discount_code_id ?? "None",
            discount_program_id ?? "None",
            discount_code ?? "None",
            discount_amount
        );

        // Validation: slot/time required; phone always required
        if (!slot_start || !slot_end || !timezone) {
            return NextResponse.json(
                { ok: false, message: "Missing required fields (slot/time)", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }
        if (!contact_phone || String(contact_phone).trim() === "") {
            return NextResponse.json(
                { ok: false, error: "Phone number is required.", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }
        const hasPersonId = !!person_id_from_quote;
        const hasEmailAndPhone = !!(contact_email?.trim() && contact_phone?.trim());
        if (!hasPersonId && !hasEmailAndPhone) {
            return NextResponse.json(
                { ok: false, message: "Provide person_id (from quote) or both contact_email and contact_phone", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }
        // discount_program_id or discount_code_id when booking is discounted
        const hasDiscount = Number(discount_amount) > 0 || (quote_total != null && quote_subtotal != null && Number(quote_total) < Number(quote_subtotal));
        if (hasDiscount && !discount_code_id && !discount_program_id) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Discount requires a valid promo (discount_program_id or discount_code_id missing).",
                    booking_attempt_id: booking_attempt_id ?? null,
                },
                { status: 400 }
            );
        }

        /** Book-v2 body uses dollars; `jobs.discount_amount` is stored in integer cents (same as admin resolver). */
        const discountAmountDollars =
            typeof discount_amount === "number" && Number.isFinite(discount_amount)
                ? discount_amount
                : Number(discount_amount) || 0;
        const jobDiscountAmountCents =
            hasDiscount && discountAmountDollars > 0 ? Math.round(discountAmountDollars * 100) : null;

        const supabase = createServiceRoleClient();
        const publicOrgIdForStages = (process.env.ALLOY_PUBLIC_ORG_ID ?? "").trim() || null;
        const bookedPipelineStageIdResolved =
            (await resolvePipelineStageIdByOrgKey(supabase, publicOrgIdForStages, "booked")) ??
            pipelineStageEnvFallback("booked") ??
            BOOKED_PIPELINE_STAGE_ID;
        const confirmRouteT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        bookV2PerfLog("confirm_route_entry", confirmRouteT0, booking_attempt_id ?? null);

        if (opportunity_id_from_quote && person_id_from_quote) {
            const linkedOk = await quoteLinkedIdentityMatchesSubmission(supabase, {
                person_id: person_id_from_quote,
                contact_email,
                contact_phone,
                contact_first_name,
                contact_last_name,
            });
            if (!linkedOk) {
                console.warn(
                    "[BOOK_V2_CONFIRM] Dropping quote opportunity/person/customer ids — submission does not match linked identity"
                );
                opportunity_id_from_quote = null;
                person_id_from_quote = null;
                customer_id_from_quote = null;
            }
        }

        const useQuoteIds = !!(opportunity_id_from_quote && person_id_from_quote);

        let customerId!: string;
        let opportunityId!: string;
        let verticalId!: string;
        let jobDate!: string;
        let jobTimeWindow!: string;
        let personIdFromQuote: string | null = person_id_from_quote ?? null;

        if (useQuoteIds) {
            const { data: opp, error: oppVerifyErr } = await supabase
                .from("opportunities")
                .select("id, primary_person_id, customer_id, vertical_id, org_id")
                .eq("id", opportunity_id_from_quote)
                .single();
            if (oppVerifyErr || !opp) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "QUOTE_ID_MISMATCH",
                        message: "Invalid or mismatched opportunity from quote. Please refresh your quote and try again.",
                        action: "CLEAR_QUOTE_AND_RESTART",
                        booking_attempt_id: booking_attempt_id ?? null,
                    },
                    { status: 409 }
                );
            }
            const oppPrimaryPersonId = (opp as { primary_person_id?: string | null }).primary_person_id ?? null;
            const trimmedPersonFromBody = person_id_from_quote!.trim();
            if (oppPrimaryPersonId != null && oppPrimaryPersonId !== trimmedPersonFromBody) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "QUOTE_ID_MISMATCH",
                        message: "Invalid or mismatched opportunity/person from quote. Please refresh your quote and try again.",
                        action: "CLEAR_QUOTE_AND_RESTART",
                        booking_attempt_id: booking_attempt_id ?? null,
                    },
                    { status: 409 }
                );
            }
            if (oppPrimaryPersonId == null && trimmedPersonFromBody) {
                await supabase.from("opportunities").update({ primary_person_id: trimmedPersonFromBody }).eq("id", opportunity_id_from_quote);
            }
            opportunityId = opportunity_id_from_quote!;
            verticalId = opp.vertical_id ?? "";
            if (!verticalId) {
                const { data: vert } = await supabase
                    .from("verticals")
                    .select("id")
                    .eq("slug", "cleaning")
                    .eq("is_active", true)
                    .limit(1)
                    .maybeSingle();
                verticalId = vert?.id ?? "";
            }
            if (!verticalId) {
                return NextResponse.json(
                    { ok: false, message: "Vertical not found", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
            const oppCustomerId = (opp as { customer_id?: string | null }).customer_id ?? null;
            const oppOrgId = (opp as { org_id?: string | null }).org_id ?? process.env.ALLOY_PUBLIC_ORG_ID ?? null;
            const quotePersonId: string = trimmedPersonFromBody;
            personIdFromQuote = quotePersonId;

            if (oppCustomerId) {
                customerId = oppCustomerId;
                const orgForLink = (oppOrgId ?? publicOrgIdForStages ?? "").trim();
                if (orgForLink) {
                    await ensureCustomerPersonsPrimaryLink(supabase, {
                        customerId,
                        personId: quotePersonId,
                        orgId: orgForLink,
                    });
                }
                await supabase
                    .from("opportunities")
                    .update({ primary_person_id: quotePersonId, customer_id: customerId })
                    .eq("id", opportunityId);
            } else {
                try {
                    const { customer_id } = await ensureCustomerForPersonNative(supabase, quotePersonId, {
                        vertical_id: verticalId,
                        org_id: oppOrgId,
                        first_name: contact_first_name ?? null,
                        last_name: contact_last_name ?? null,
                        email: contact_email ?? null,
                        phone: contact_phone ?? null,
                    });
                    customerId = customer_id;
                    await supabase
                        .from("opportunities")
                        .update({
                            customer_id: customerId,
                            primary_person_id: quotePersonId,
                        })
                        .eq("id", opportunityId);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                    console.error("[BOOK_V2_CONFIRM] ensureCustomerForPersonNative (quote path) failed", msg, err);
                    const codeMatch = msg.match(/\(code:\s*([^)]+)\)/);
                    return NextResponse.json(
                        {
                            ok: false,
                            message: msg,
                            booking_attempt_id: booking_attempt_id ?? null,
                            ...(codeMatch && { error_code: codeMatch[1] }),
                        },
                        { status: 500 }
                    );
                }
            }

            const tQuoteParallel = typeof performance !== "undefined" ? performance.now() : Date.now();
            const needsDiscountEarly = !!(customerId && (discount_code_id || discount_program_id));
            const [redemptionEarly, parallelReads] = await Promise.all([
                needsDiscountEarly
                    ? assertNoPriorDiscountRedemption(supabase, {
                          customerId,
                          discount_code_id,
                          discount_program_id,
                          booking_attempt_id,
                      })
                    : Promise.resolve(null),
                Promise.all([
                    supabase.from("customers").select("vertical_id").eq("id", customerId).single(),
                    supabase.from("opportunities").select("metadata").eq("id", opportunityId).single(),
                ]),
            ]);
            bookV2PerfLog("quote_parallel_discount_meta", tQuoteParallel, booking_attempt_id ?? null);
            if (redemptionEarly) return redemptionEarly;

            const [{ data: custRow }, { data: oppMetaRow }] = parallelReads;
            if (custRow && custRow.vertical_id == null) {
                await supabase.from("customers").update({ vertical_id: verticalId }).eq("id", customerId);
            }

            const slotStartDateQ = new Date(slot_start);
            const slotEndDateQ = new Date(slot_end);
            jobDate = slotStartDateQ.toLocaleDateString("en-US", { timeZone: timezone });
            jobTimeWindow = `${slotStartDateQ.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone, hour12: true })} - ${slotEndDateQ.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone, hour12: true })}`;
            const estimatedPriceCents =
                quote_total != null ? Math.round(quote_total * 100)
                : quote_subtotal != null ? Math.round(quote_subtotal * 100)
                : first_clean_price != null ? Math.round(first_clean_price * 100)
                : null;

            const existingMeta = ((oppMetaRow?.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>;
            const svcMeta = (existingMeta.book_v2_service_property as Record<string, unknown> | undefined) ?? {};
            const qiMeta = (existingMeta.quote_input as Record<string, unknown> | undefined) ?? {};
            const mergedMetadata: Record<string, unknown> = {
                ...existingMeta,
                booking_source: "book-v2",
                booking_attempt_id: booking_attempt_id ?? undefined,
                timezone,
                address: address ?? null,
                city: city ?? null,
                // Property snapshot: book_v2_service_property + quote_input (avoid duplicating home_type/bed/bath at top level).
                access_method: pickServiceDetail(access_method, svcMeta.access_method, undefined),
                access_note: pickServiceDetail(access_note, svcMeta.access_note, undefined),
                additional_notes: pickServiceDetail(additional_notes, svcMeta.additional_notes, undefined),
            };
            const normalizedQuoteInput =
                quote_input != null && typeof quote_input === "object"
                    ? { ...qiMeta, ...quote_input, cleaning_frequency: service_frequency_key }
                    : { ...qiMeta, cleaning_frequency: service_frequency_key };
            mergedMetadata.quote_input = normalizedQuoteInput;
            if (quote_output != null && typeof quote_output === "object") mergedMetadata.quote_output = quote_output;

            const oppUpdate: Record<string, unknown> = {
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal ?? null,
                discount_amount: discount_amount ?? null,
                quote_total: quote_total ?? null,
                estimated_price_cents: estimatedPriceCents,
                monetary_value_cents: estimatedPriceCents,
                metadata: mergedMetadata,
                pipeline_stage_id: bookedPipelineStageIdResolved,
                status_key: BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
            };
            if (typeof personIdFromQuote === "string" && personIdFromQuote.trim()) {
                oppUpdate.primary_person_id = personIdFromQuote.trim();
            }
            if (recurringCents != null) (oppUpdate as Record<string, unknown>).recurring_price_cents = recurringCents;
            if (discount_program_id != null) {
                (oppUpdate as Record<string, unknown>).discount_program_id = discount_program_id;
            }
            if (discount_code_id != null) {
                (oppUpdate as Record<string, unknown>).discount_code_id = discount_code_id;
            }
            if (discount_code != null) {
                (oppUpdate as Record<string, unknown>).discount_code = discount_code;
            }

            const { error: oppUpdateError } = await supabase
                .from("opportunities")
                .update(oppUpdate)
                .eq("id", opportunityId);
            if (oppUpdateError) {
                return NextResponse.json(
                    { ok: false, message: "Failed to update opportunity", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
            console.log(`[BOOK_V2_CONFIRM] Reused quote opportunity opportunity_id=${opportunityId} set to Booked`);
        } else {
        // Orphan person/customer ids without a usable opportunity: validate person against submission.
        if (person_id_from_quote) {
            const orphanOk = await quoteLinkedIdentityMatchesSubmission(supabase, {
                person_id: person_id_from_quote,
                contact_email,
                contact_phone,
                contact_first_name,
                contact_last_name,
            });
            if (!orphanOk) {
                console.warn(
                    "[BOOK_V2_CONFIRM] else_branch: dropping orphan person/customer ids (identity mismatch vs submission); resolver path"
                );
                person_id_from_quote = null;
                customer_id_from_quote = null;
                personIdFromQuote = null;
            }
        }

        // Parse dates
        const slotStartDate = new Date(slot_start);
        const slotEndDate = new Date(slot_end);

        // Format job_date and job_time_window in customer timezone
        jobDate = slotStartDate.toLocaleDateString("en-US", {
            timeZone: timezone,
        });
        jobTimeWindow = `${slotStartDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: timezone,
            hour12: true,
        })} - ${slotEndDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: timezone,
            hour12: true,
        })}`;

        // Get vertical_id first so we can pass it to resolver (customer.vertical_id set/backfill)
        const { data: verticalElse, error: verticalElseError } = await supabase
            .from("verticals")
            .select("id")
            .eq("slug", "cleaning")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        if (verticalElseError || !verticalElse?.id) {
            console.error("[BOOK_V2_CONFIRM] Vertical 'cleaning' not found (else branch)", verticalElseError);
            return NextResponse.json(
                { ok: false, message: "Service not available", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }
        const verticalIdElse = verticalElse.id;

        const publicOrgIdElse = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const emailForResolver = contact_email?.trim() ?? "";
        const phoneRawForResolver = contact_phone?.trim() ?? "";

        if (personIdFromQuote?.trim()) {
            const pid = personIdFromQuote.trim();
            const cidStored = customer_id_from_quote?.trim() ?? null;
            if (cidStored) {
                const { data: linkRow } = await supabase
                    .from("customer_persons")
                    .select("id")
                    .eq("person_id", pid)
                    .eq("customer_id", cidStored)
                    .maybeSingle();
                if (linkRow) {
                    customerId = cidStored;
                    const orgForLink = (publicOrgIdElse ?? "").trim();
                    if (orgForLink) {
                        await ensureCustomerPersonsPrimaryLink(supabase, {
                            customerId,
                            personId: pid,
                            orgId: orgForLink,
                        });
                    }
                } else {
                    try {
                        const { customer_id } = await ensureCustomerForPersonNative(supabase, pid, {
                            vertical_id: verticalIdElse,
                            org_id: publicOrgIdElse,
                            first_name: contact_first_name ?? null,
                            last_name: contact_last_name ?? null,
                            email: contact_email ?? null,
                            phone: contact_phone ?? null,
                        });
                        customerId = customer_id;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForPersonNative (else branch) failed", msg, err);
                        const codeMatch = msg.match(/\(code:\s*([^)]+)\)/);
                        return NextResponse.json(
                            {
                                ok: false,
                                message: msg,
                                booking_attempt_id: booking_attempt_id ?? null,
                                ...(codeMatch && { error_code: codeMatch[1] }),
                            },
                            { status: 500 }
                        );
                    }
                }
            } else {
                try {
                    const { customer_id } = await ensureCustomerForPersonNative(supabase, pid, {
                        vertical_id: verticalIdElse,
                        org_id: publicOrgIdElse,
                        first_name: contact_first_name ?? null,
                        last_name: contact_last_name ?? null,
                        email: contact_email ?? null,
                        phone: contact_phone ?? null,
                    });
                    customerId = customer_id;
                } catch (err) {
                    const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                    console.error("[BOOK_V2_CONFIRM] ensureCustomerForPersonNative (else branch, no stored customer) failed", msg, err);
                    const codeMatch = msg.match(/\(code:\s*([^)]+)\)/);
                    return NextResponse.json(
                        {
                            ok: false,
                            message: msg,
                            booking_attempt_id: booking_attempt_id ?? null,
                            ...(codeMatch && { error_code: codeMatch[1] }),
                        },
                        { status: 500 }
                    );
                }
            }
            personIdFromQuote = pid;
            console.log(
                `[BOOK_V2_CONFIRM] Person-native else path booking_attempt_id=${booking_attempt_id ?? "None"} person_id=${personIdFromQuote} customer_id=${customerId}`
            );
        } else {
            try {
                const resolverResult = await resolveOrCreatePersonCustomerForBooking(supabase, {
                    org_id: publicOrgIdElse,
                    vertical_id: verticalIdElse,
                    booking_attempt_id: booking_attempt_id ?? null,
                    person_id: null,
                    first_name: contact_first_name ?? null,
                    last_name: contact_last_name ?? null,
                    email: emailForResolver,
                    phone: phoneRawForResolver,
                });
                personIdFromQuote = resolverResult.person_id;
                customerId = resolverResult.customer_id;
                console.log(
                    `[BOOK_V2_CONFIRM] Person-native resolver booking_attempt_id=${booking_attempt_id ?? "None"} person_id=${personIdFromQuote} customer_id=${customerId} resolution_path=${resolverResult.resolution_path}`
                );
            } catch (error: unknown) {
                const errMsg = error instanceof Error ? error.message : String(error);
                const pgCodeMatch = errMsg.match(/\(pg:\s*([^)]+)\)/);
                console.error("[BOOK_V2_CONFIRM] Person-native resolver failed", {
                    booking_attempt_id: booking_attempt_id ?? null,
                    error_message: errMsg,
                });
                return NextResponse.json(
                    {
                        ok: false,
                        message: `Could not resolve booking person and customer. ${errMsg}`,
                        booking_attempt_id: booking_attempt_id ?? null,
                        ...(pgCodeMatch && { error_code: pgCodeMatch[1] }),
                    },
                    { status: 500 }
                );
            }
        }

        // Step 2: If discount used, check redemption not already recorded (enforce "once per customer")
        if (customerId && (discount_code_id || discount_program_id)) {
            const redemptionMid = await assertNoPriorDiscountRedemption(supabase, {
                customerId,
                discount_code_id,
                discount_program_id,
                booking_attempt_id,
            });
            if (redemptionMid) return redemptionMid;
        }

        // Step 3: Assign outer verticalId (must not use `const` here — that shadowed `let verticalId` and left it unset after this branch, skipping recurring subscription creation)
        verticalId = verticalIdElse;

        // Step 4: Find or create opportunity
        // Prefer: (1) idempotent retry same booking_attempt_id, (2) reuse recent "Quote Started" + web_quote for this person+customer (last 30 min), (3) create new.
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentOpps, error: oppSearchError } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_person_id, metadata, pipeline_stage_id")
            .eq("customer_id", customerId)
            .eq("primary_person_id", personIdFromQuote)
            .eq("status", "open")
            .gte("created_at", thirtyMinutesAgo)
            .order("created_at", { ascending: false })
            .limit(5);

        if (oppSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for opportunity booking_attempt_id=", booking_attempt_id, oppSearchError);
            return NextResponse.json(
                { ok: false, message: "Failed to search for opportunity", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const list = recentOpps ?? [];
        let existingOpp: (typeof list)[0] | null = null;
        if (booking_attempt_id && list.length > 0) {
            const byAttempt = list.find(
                (o) => (o.metadata as Record<string, unknown> | null)?.booking_attempt_id === booking_attempt_id
            );
            if (byAttempt) existingOpp = byAttempt;
        }
        if (!existingOpp && list.length > 0) {
            const { data: pipelines } = await supabase.from("pipelines").select("id").order("name", { ascending: true }).limit(1);
            const pipelineId = pipelines?.[0]?.id ?? null;
            let quoteStartedStageId: string | null = null;
            if (pipelineId) {
                const { data: stage } = await supabase
                    .from("pipeline_stages")
                    .select("id")
                    .eq("pipeline_id", pipelineId)
                    .ilike("name", "Quote Started")
                    .limit(1)
                    .maybeSingle();
                quoteStartedStageId = stage?.id ?? null;
            }
            const webQuoteOpp = list.find(
                (o) =>
                    (o.metadata as Record<string, unknown> | null)?.source === "web_quote" &&
                    (quoteStartedStageId == null || o.pipeline_stage_id === quoteStartedStageId)
            );
            if (webQuoteOpp) existingOpp = webQuoteOpp;
        }

        if (existingOpp) {
            opportunityId = existingOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing opportunity booking_attempt_id=${booking_attempt_id ?? "None"} opportunity_id=${opportunityId} (reused)`);

            const { data: existingOppData } = await supabase
                .from("opportunities")
                .select("vertical_id, customer_id, primary_person_id, monetary_value_cents, metadata")
                .eq("id", opportunityId)
                .single();

            const estimatedPriceCentsElse =
                quote_total != null ? Math.round(quote_total * 100)
                : quote_subtotal != null ? Math.round(quote_subtotal * 100)
                : first_clean_price != null ? Math.round(first_clean_price * 100)
                : null;
            const existingMetaElse = ((existingOppData?.metadata ?? existingOpp?.metadata) as Record<string, unknown>) ?? {};
            const svcElse = (existingMetaElse.book_v2_service_property as Record<string, unknown> | undefined) ?? {};
            const qiElse = (existingMetaElse.quote_input as Record<string, unknown> | undefined) ?? {};
            const mergedMetaElse: Record<string, unknown> = {
                ...existingMetaElse,
                booking_source: "book-v2",
                booking_attempt_id: booking_attempt_id ?? undefined,
                timezone,
                address: address ?? null,
                city: city ?? null,
                access_method: pickServiceDetail(access_method, svcElse.access_method, undefined),
                access_note: pickServiceDetail(access_note, svcElse.access_note, undefined),
                additional_notes: pickServiceDetail(additional_notes, svcElse.additional_notes, undefined),
            };
            const normalizedQuoteInputElse =
                quote_input != null && typeof quote_input === "object"
                    ? { ...qiElse, ...quote_input, cleaning_frequency: service_frequency_key }
                    : { ...qiElse, cleaning_frequency: service_frequency_key };
            mergedMetaElse.quote_input = normalizedQuoteInputElse;
            if (quote_output != null && typeof quote_output === "object") mergedMetaElse.quote_output = quote_output;

            const updatePayload: Record<string, any> = {
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal ?? null,
                discount_amount: discount_amount ?? null,
                quote_total: quote_total ?? null,
                estimated_price_cents: estimatedPriceCentsElse,
                monetary_value_cents: estimatedPriceCentsElse ?? undefined,
                customer_id: customerId,
                ...(typeof personIdFromQuote === "string" && personIdFromQuote.trim()
                    ? { primary_person_id: personIdFromQuote.trim() }
                    : {}),
                metadata: mergedMetaElse,
                pipeline_stage_id: bookedPipelineStageIdResolved,
                status_key: BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
            };
            if (recurringCents != null) updatePayload.recurring_price_cents = recurringCents;
            if (discount_program_id != null || discount_code_id != null) {
                if (discount_program_id != null) updatePayload.discount_program_id = discount_program_id;
                if (discount_code_id != null) updatePayload.discount_code_id = discount_code_id;
                if (discount_code != null) updatePayload.discount_code = discount_code;
                updatePayload.discount_amount = discount_amount ?? null;
            }
            if (existingOppData && !existingOppData.vertical_id) updatePayload.vertical_id = verticalId;

            const { error: oppUpdateError } = await supabase
                .from("opportunities")
                .update(updatePayload)
                .eq("id", opportunityId);

            if (oppUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update opportunity booking_attempt_id=", booking_attempt_id, oppUpdateError);
                return NextResponse.json(
                    { ok: false, message: "Failed to update opportunity", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
        } else {
            const estimatedPriceCentsNew =
                quote_total != null ? Math.round(quote_total * 100)
                : quote_subtotal != null ? Math.round(quote_subtotal * 100)
                : first_clean_price != null ? Math.round(first_clean_price * 100)
                : null;
            const insertMeta: Record<string, unknown> = {
                booking_source: "book-v2",
                booking_attempt_id: booking_attempt_id ?? undefined,
                timezone,
                address: address ?? null,
                city: city ?? null,
                access_method: access_method ?? null,
                access_note: access_note ?? null,
                additional_notes: additional_notes ?? null,
            };
            const normalizedQuoteInputInsert =
                quote_input != null && typeof quote_input === "object"
                    ? { ...quote_input, cleaning_frequency: service_frequency_key }
                    : { cleaning_frequency: service_frequency_key };
            insertMeta.quote_input = normalizedQuoteInputInsert;
            if (quote_output != null && typeof quote_output === "object") insertMeta.quote_output = quote_output;

            const insertPayload: Record<string, unknown> = {
                org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                vertical_id: verticalId,
                ...(typeof personIdFromQuote === "string" && personIdFromQuote.trim()
                    ? { primary_person_id: personIdFromQuote.trim() }
                    : {}),
                customer_id: customerId,
                name: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                status: "open",
                source: "website",
                pipeline_stage_id: bookedPipelineStageIdResolved,
                status_key: BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal ?? null,
                discount_amount: discount_amount ?? null,
                quote_total: quote_total ?? null,
                estimated_price_cents: estimatedPriceCentsNew,
                monetary_value_cents: estimatedPriceCentsNew ?? undefined,
                ...(recurringCents != null && { recurring_price_cents: recurringCents }),
                ...(discount_program_id != null && { discount_program_id }),
                ...(discount_code_id != null && { discount_code_id }),
                ...((discount_program_id != null || discount_code_id != null) && {
                    discount_code: discount_code ?? null,
                    discount_amount: discount_amount ?? null,
                }),
                metadata: insertMeta,
            };
            const { data: newOpp, error: oppError } = await supabase
                .from("opportunities")
                .insert(insertPayload)
                .select("id")
                .single();

            if (oppError || !newOpp) {
                console.error("[BOOK_V2_CONFIRM] Failed to create opportunity booking_attempt_id=", booking_attempt_id, oppError);
                return NextResponse.json(
                    { ok: false, message: "Failed to create opportunity", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }

            opportunityId = newOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Created new opportunity booking_attempt_id=${booking_attempt_id ?? "None"} opportunity_id=${opportunityId}`);
        }
        } // end else (!useQuoteIds)

        const resolvedPrimaryPersonId = await resolvePrimaryPersonIdForConfirm(supabase, {
            personId: personIdFromQuote,
            customerId,
            opportunityId,
        });
        if (resolvedPrimaryPersonId) {
            personIdFromQuote = resolvedPrimaryPersonId;
            await supabase.from("opportunities").update({ primary_person_id: resolvedPrimaryPersonId }).eq("id", opportunityId);
        }
        if (!personIdFromQuote?.trim()) {
            return NextResponse.json(
                {
                    ok: false,
                    message: "Missing primary person for booking; refresh and try again.",
                    booking_attempt_id: booking_attempt_id ?? null,
                },
                { status: 500 }
            );
        }
        personIdFromQuote = personIdFromQuote.trim();

        // Step 4b: Canonical location — reuse opportunity.location_id when present (quote stage), else create/link
        const orgIdForLocation = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const { data: oppForLocation } = await supabase
            .from("opportunities")
            .select("metadata, location_id")
            .eq("id", opportunityId)
            .maybeSingle();
        const oppMeta = (oppForLocation?.metadata as Record<string, unknown>) ?? {};
        const svcPropBook = (oppMeta.book_v2_service_property as Record<string, unknown> | undefined) ?? {};
        const hasPetsFromSvc =
            svcPropBook.has_pets === true || svcPropBook.has_pets === "true" || svcPropBook.has_pets === 1
                ? true
                : svcPropBook.has_pets === false || svcPropBook.has_pets === "false" || svcPropBook.has_pets === 0
                  ? false
                  : null;
        const effectiveHasPetsForLocation = hasPetsResolved ?? hasPetsFromSvc;
        const quoteInput = (oppMeta.quote_input as Record<string, unknown>) ?? {};
        function asOptionalString(v: unknown): string | undefined {
            if (v == null) return undefined;
            const s = String(v).trim();
            return s !== "" ? s : undefined;
        }
        const locationPostalCode: string | null =
            asOptionalString(body.postal_code) ??
            asOptionalString(body.zip) ??
            asOptionalString(body.postalCode) ??
            asOptionalString(quoteInput.zip) ??
            asOptionalString(quoteInput.postal_code) ??
            asOptionalString(oppMeta.postal_code) ??
            asOptionalString(oppMeta.zip) ??
            null;
        const locationState: string | null =
            asOptionalString(body.state) ??
            asOptionalString(body.address_state) ??
            asOptionalString(body.region) ??
            asOptionalString(oppMeta.state) ??
            asOptionalString(quoteInput.state) ??
            null;
        if (address && !locationPostalCode) {
            console.warn("[BOOK_V2_CONFIRM] postal_code missing for location", { booking_attempt_id: booking_attempt_id ?? null, opportunity_id: opportunityId });
        }
        const accessMethodUi =
            String(pickServiceDetail(access_method, svcPropBook.access_method, undefined) ?? "home").trim() || "home";
        const accessNoteMerged = pickServiceDetail(access_note, svcPropBook.access_note, undefined);
        const additionalNotesMerged = pickServiceDetail(additional_notes, svcPropBook.additional_notes, undefined);
        const { access_code: locationAccessCode, access_notes: locationAccessNotes } = splitBookV2LocationAccess({
            access_method: accessMethodUi,
            access_note: accessNoteMerged != null ? String(accessNoteMerged) : undefined,
            additional_notes: additionalNotesMerged != null ? String(additionalNotesMerged) : undefined,
        });
        const accessMethodKeyForLocation = uiAccessMethodToStableKey(accessMethodUi);
        let locationId: string | null = null;
        const tCanonicalLoc = typeof performance !== "undefined" ? performance.now() : Date.now();
        try {
            locationId = await ensureCanonicalBookingLocation(supabase, {
                opportunity_id: opportunityId,
                existing_location_id: (oppForLocation as { location_id?: string | null } | null)?.location_id ?? null,
                org_id: orgIdForLocation,
                customer_id: customerId,
                address_line1: address ?? null,
                city: city ?? null,
                state: locationState,
                postal_code: locationPostalCode,
                access_method_key: accessMethodKeyForLocation,
                access_code: locationAccessCode,
                has_pets: effectiveHasPetsForLocation,
                access_notes: locationAccessNotes,
            });
        } catch (locErr) {
            console.warn("[BOOK_V2_CONFIRM] ensureCanonicalBookingLocation failed", locErr);
        }
        bookV2PerfLog("canonical_location", tCanonicalLoc, booking_attempt_id ?? null);

        if (locationId && orgIdForLocation) {
            try {
                const mergedByKey: Record<string, unknown> = { ...cfgBag };
                if (home_type != null && String(home_type).trim()) mergedByKey.home_type = home_type;
                if (bedrooms != null && String(bedrooms).trim()) mergedByKey.bedrooms = bedrooms;
                if (bathrooms != null && String(bathrooms).trim()) mergedByKey.bathrooms = bathrooms;
                if (hasPetsResolved === true || hasPetsResolved === false) {
                    mergedByKey.pets = hasPetsResolved ? "true" : "false";
                }

                const qiPeek = (oppMeta.quote_input as Record<string, unknown> | undefined) ?? {};
                const nativeLoc: Record<string, unknown> = {
                    access_method_key: accessMethodKeyForLocation,
                    access_method_id: null,
                    updated_at: new Date().toISOString(),
                };
                if (verticalId) {
                    const sqftFromQuoteRow = qiPeek.square_footage;
                    if (sqftFromQuoteRow != null && String(sqftFromQuoteRow).trim() !== "") {
                        const tiers = await loadSqftTiersForVertical(supabase, verticalId);
                        nativeLoc.square_footage_tier_key = normalizeSqftKeyInput(
                            sqftFromQuoteRow as string | number,
                            tiers
                        );
                    }
                }
                const home_type_for_loc = pickBookV2PropertyField(
                    home_type,
                    mergedByKey.home_type,
                    svcPropBook.home_type_label,
                    qiPeek.home_type
                );
                const hkLoc = homeTypeInputToStableKey(home_type_for_loc);
                if (hkLoc) nativeLoc.home_type_key = hkLoc;
                const bedrooms_for_loc = pickBookV2PropertyField(
                    bedrooms,
                    mergedByKey.bedrooms,
                    svcPropBook.bedrooms,
                    qiPeek.bedrooms
                );
                const bathrooms_for_loc = pickBookV2PropertyField(
                    bathrooms,
                    mergedByKey.bathrooms,
                    svcPropBook.bathrooms,
                    qiPeek.bathrooms
                );
                const bedsNumLoc = parseBedsFromBody(bedrooms_for_loc);
                const bathLoc = parseBathroomsForCjd(bathrooms_for_loc);
                if (bedsNumLoc != null) nativeLoc.beds = bedsNumLoc;
                if (bathLoc.baths != null) nativeLoc.baths = bathLoc.baths;

                await supabase.from("locations").update(nativeLoc).eq("id", locationId).eq("org_id", orgIdForLocation);

                const publicDefs = await loadPublicBookingFieldDefRows(supabase, orgIdForLocation, "location");
                await upsertConfigurableFieldValuesForEntity(
                    supabase,
                    orgIdForLocation,
                    "location",
                    locationId,
                    publicDefs,
                    mergedByKey
                );
            } catch (fvErr) {
                console.warn("[BOOK_V2_CONFIRM] location field_values upsert failed", fvErr);
            }
        }

        const bookingOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const resolvedJobSt = await resolveBookingJobStatus(supabase, bookingOrgId, BOOKING_CONFIRM_JOB_STATUS_RESOLVE_KEYS);
        const bookingJobStatusId = resolvedJobSt?.id ?? BOOKING_CONFIRM_JOB_STATUS_ID;
        const bookingJobStatusKey = resolvedJobSt?.key ?? BOOKING_CONFIRM_JOB_STATUS_KEY;
        const resolvedSchedSt = await resolveScheduleStatusRowByKey(supabase, BOOKING_CONFIRM_SCHEDULE_STATUS_KEY);
        const bookingScheduleStatusId = resolvedSchedSt?.id ?? BOOKING_CONFIRM_SCHEDULE_STATUS_ID;
        const bookingScheduleStatusKey = resolvedSchedSt?.key ?? BOOKING_CONFIRM_SCHEDULE_STATUS_KEY;
        console.log(
            `[BOOK_V2_CONFIRM] status_resolution job_status_id=${bookingJobStatusId} job_status_key=${bookingJobStatusKey} schedule_status_id=${bookingScheduleStatusId} schedule_status_key=${bookingScheduleStatusKey} booking_attempt_id=${booking_attempt_id ?? "none"}`
        );

        // Step 5: Create or update job
        // Reuse only if existing job has same booking_attempt_id (idempotent retry). Otherwise create new.
        const tJobSchedBlock = typeof performance !== "undefined" ? performance.now() : Date.now();
        const { data: existingJobRow, error: jobSearchError } = await supabase
            .from("jobs")
            .select("id, customer_id, primary_person_id, metadata, vertical_id, estimated_total_cents, gross_price_cents, service_frequency_key")
            .eq("opportunity_id", opportunityId)
            .limit(1)
            .maybeSingle();

        if (jobSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for job booking_attempt_id=", booking_attempt_id, jobSearchError);
            return NextResponse.json(
                { ok: false, message: "Failed to search for job", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const existingJob =
            existingJobRow &&
            booking_attempt_id &&
            (existingJobRow.metadata as Record<string, unknown> | null)?.booking_attempt_id === booking_attempt_id
                ? existingJobRow
                : null;

        let jobId: string;

        if (existingJob) {
            jobId = existingJob.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing job booking_attempt_id=${booking_attempt_id ?? "None"} job_id=${jobId} (reused)`);

            const existingJobData = existingJob as {
                vertical_id?: string | null;
                estimated_total_cents?: number | null;
                gross_price_cents?: number | null;
                service_frequency_key?: string | null;
            };

            // Update job and backfill all links and fields; persist metadata for this attempt
            const jobMeta = ((existingJob as { metadata?: Record<string, unknown> })?.metadata) || {};
            const jobUpdatePayload: Record<string, any> = {
                scheduled_at: slot_start,
                customer_id: customerId,
                ...(typeof personIdFromQuote === "string" && personIdFromQuote.trim()
                    ? { primary_person_id: personIdFromQuote.trim() }
                    : {}),
                is_recurring: is_recurring,
                service_key: "cleaning",
                service_frequency_key: service_frequency_key,
                job_status_id: bookingJobStatusId,
                status_key: bookingJobStatusKey,
                ...(locationId != null && { location_id: locationId }),
                metadata: {
                    ...jobMeta,
                    booking_attempt_id: booking_attempt_id ?? undefined,
                    frequency_label: frequency_label ?? undefined,
                    service_frequency_key: service_frequency_key,
                },
            };
            if (discount_program_id != null || discount_code_id != null) {
                jobUpdatePayload.discounted = true;
                if (discount_program_id != null) jobUpdatePayload.discount_program_id = discount_program_id;
                if (discount_code_id != null) jobUpdatePayload.discount_code_id = discount_code_id;
                jobUpdatePayload.discount_code = discount_code ?? null;
                jobUpdatePayload.discount_amount = jobDiscountAmountCents;
            }

            // Backfill vertical_id if missing
            if (existingJobData && !existingJobData.vertical_id) {
                jobUpdatePayload.vertical_id = verticalId;
            }

            // First-visit gross/estimated totals are set by initializeJobPricing (job_line_items + jobs pricing columns).
            jobUpdatePayload.recurring_total_cents = is_recurring ? recurringCents : null;
            if (!existingJobData?.service_frequency_key) {
                console.log(`[BOOK_V2_CONFIRM] Backfilled job.service_frequency_key=${service_frequency_key} job_id=${jobId}`);
            }

            const { error: jobUpdateError } = await supabase
                .from("jobs")
                .update(jobUpdatePayload)
                .eq("id", jobId);

            if (jobUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update job booking_attempt_id=", booking_attempt_id, jobUpdateError);
                return NextResponse.json(
                    { ok: false, message: "Failed to update job", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
        } else {
            // Create new job
            const jobPayload: Record<string, any> = {
                org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                opportunity_id: opportunityId,
                customer_id: customerId,
                ...(typeof personIdFromQuote === "string" && personIdFromQuote.trim()
                    ? { primary_person_id: personIdFromQuote.trim() }
                    : {}),
                vertical_id: verticalId,
                job_status_id: bookingJobStatusId,
                status_key: bookingJobStatusKey,
                ...(locationId != null && { location_id: locationId }),
                title: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                description: `Scheduled cleaning service`,
                scheduled_at: slot_start,
                is_recurring: is_recurring,
                service_key: "cleaning",
                service_frequency_key: service_frequency_key,
                ...((discount_program_id != null || discount_code_id != null) && {
                    discounted: true,
                    ...(discount_program_id != null && { discount_program_id }),
                    ...(discount_code_id != null && { discount_code_id }),
                    discount_code: discount_code ?? null,
                    discount_amount: jobDiscountAmountCents,
                }),
                metadata: {
                    booking_source: "book-v2",
                    booking_attempt_id: booking_attempt_id ?? undefined,
                    frequency_label: frequency_label ?? undefined,
                    service_frequency_key: service_frequency_key,
                    timezone,
                    quote_subtotal,
                    discount_amount,
                    quote_total,
                    address: address || null,
                    city: city || null,
                },
            };

            const { data: newJob, error: jobError } = await supabase
                .from("jobs")
                .insert(jobPayload)
                .select("id")
                .single();

            if (jobError || !newJob) {
                console.error("[BOOK_V2_CONFIRM] Failed to create job booking_attempt_id=", booking_attempt_id, jobError);
                return NextResponse.json(
                    { ok: false, message: "Failed to create job", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }

            jobId = newJob.id;
            console.log(`[BOOK_V2_CONFIRM] Created new job booking_attempt_id=${booking_attempt_id ?? "None"} job_id=${jobId}`);
        }

        // Guard: Ensure job_id exists
        if (!jobId) {
            console.error("[BOOK_V2_CONFIRM] job_id missing, aborting booking_attempt_id=", booking_attempt_id);
            return NextResponse.json(
                { ok: false, message: "Job creation failed", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const orgIdForPricing = (process.env.ALLOY_PUBLIC_ORG_ID ?? "").trim();
        if (!orgIdForPricing) {
            console.error("[BOOK_V2_CONFIRM] ALLOY_PUBLIC_ORG_ID missing for initializeJobPricing");
            return NextResponse.json(
                { ok: false, message: "Server configuration error", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const quoteOutForPricing =
            quote_output != null && typeof quote_output === "object" ? (quote_output as Record<string, unknown>) : null;

        const pricingInit = await initializeJobPricing({
            supabase,
            orgId: orgIdForPricing,
            jobId,
            quoteData: {
                grossFirstVisitCents,
                netFirstVisitCents,
                recurringCents: is_recurring ? recurringCents : null,
                quoteOutput: quoteOutForPricing,
                frequencyLabel: frequency_label ?? null,
            },
            addons: [],
            discount: {
                enabled: jobDiscountAmountCents != null && jobDiscountAmountCents > 0,
                amount_cents: jobDiscountAmountCents,
                discount_code: discount_code ?? null,
                discount_code_id: discount_code_id,
                discount_program_id: discount_program_id,
            },
            source: "book-v2",
            skipIfActiveLines: true,
            replaceExisting: true,
            actorUserId: null,
        });

        if (!pricingInit.ok) {
            console.error("[BOOK_V2_CONFIRM] initializeJobPricing failed", pricingInit.error, booking_attempt_id);
            return NextResponse.json(
                { ok: false, message: "Failed to persist job pricing", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const qiOpp = (oppMeta.quote_input as Record<string, unknown>) ?? {};
        const quoteInputForDetails =
            quote_input != null && typeof quote_input === "object"
                ? { ...qiOpp, ...(quote_input as Record<string, unknown>) }
                : qiOpp;
        const sqftBucketRaw =
            typeof quoteInputForDetails.square_footage === "string"
                ? quoteInputForDetails.square_footage
                : quoteInputForDetails.square_footage != null
                  ? String(quoteInputForDetails.square_footage)
                  : null;
        const sqftTiersForJob = await loadSqftTiersForVertical(supabase, verticalId);
        const tierKeyResolved = normalizeSqftKeyInput(sqftBucketRaw, sqftTiersForJob);
        const home_type_eff = pickBookV2PropertyField(
            home_type,
            cfgBag.home_type,
            svcPropBook.home_type_label,
            quoteInputForDetails.home_type
        );
        const bedrooms_eff = pickBookV2PropertyField(
            bedrooms,
            cfgBag.bedrooms,
            svcPropBook.bedrooms,
            quoteInputForDetails.bedrooms
        );
        const bathrooms_eff = pickBookV2PropertyField(
            bathrooms,
            cfgBag.bathrooms,
            svcPropBook.bathrooms,
            quoteInputForDetails.bathrooms
        );
        const homeTypeKeyResolved = homeTypeInputToStableKey(
            home_type_eff != null ? String(home_type_eff) : null
        );
        const bathParsed = parseBathroomsForCjd(bathrooms_eff);
        const bedsResolved = parseBedsFromBody(bedrooms_eff);
        await upsertCleaningJobDetailsFromBookV2(supabase, jobId, {
            home_type_key: homeTypeKeyResolved,
            access_method_key: accessMethodKeyForLocation,
            square_footage_tier_key: tierKeyResolved,
            beds: bedsResolved,
            baths: bathParsed.baths,
            bathrooms_booking_key: bathParsed.bookingKey,
        });

        // Step 5b: Persist discount redemption immediately after job creation
        if (discount_code_id || discount_program_id) {
            console.log(
                "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_BEFORE] booking_attempt_id=%s discount_code_id=%s discount_program_id=%s customer_id=%s person_id=%s opportunity_id=%s job_id=%s",
                booking_attempt_id ?? "None",
                discount_code_id ?? "None",
                discount_program_id ?? "None",
                customerId,
                personIdFromQuote ?? "null",
                opportunityId,
                jobId
            );

            let skipRedemptionInsert = false;
            if (booking_attempt_id) {
                const { data: idemRows, error: idemErr } = await supabase
                    .from("discount_redemptions")
                    .select("id, booking_attempt_id, discount_program_id, discount_code_id")
                    .eq("customer_id", customerId)
                    .eq("booking_attempt_id", booking_attempt_id);
                if (idemErr) {
                    console.error("[BOOK_V2_CONFIRM_REDEMPTION_IDEM_QUERY]", idemErr.message);
                } else {
                    const idemHit = (idemRows ?? []).find((r) => {
                        const row = r as {
                            discount_program_id?: string | null;
                            discount_code_id?: string | null;
                        };
                        if (discount_program_id && row.discount_program_id === discount_program_id) return true;
                        if (discount_code_id && row.discount_code_id === discount_code_id) return true;
                        return false;
                    });
                    if (idemHit) {
                        skipRedemptionInsert = true;
                        console.log(
                            "[BOOK_V2_CONFIRM_REDEMPTION_SKIP_IDEMPOTENT] booking_attempt_id=%s redemption_id=%s",
                            booking_attempt_id,
                            (idemHit as { id?: string }).id ?? "?"
                        );
                    }
                }
            }

            if (!skipRedemptionInsert) {
                const { data: redemptionRow, error: redemptionInsertError } = await supabase
                    .from("discount_redemptions")
                    .insert({
                        discount_code_id: discount_code_id ?? null,
                        discount_program_id: discount_program_id ?? null,
                        discount_code: discount_code ?? null,
                        customer_id: customerId,
                        contact_id: null,
                        opportunity_id: opportunityId,
                        job_id: jobId,
                        quote_subtotal: quote_subtotal ?? null,
                        discount_amount: discount_amount ?? null,
                        quote_total: quote_total ?? null,
                        booking_attempt_id: booking_attempt_id || null,
                    })
                    .select("id")
                    .single();

                if (redemptionInsertError) {
                    const isUniqueViolation =
                        redemptionInsertError.code === "23505" ||
                        (typeof redemptionInsertError.message === "string" &&
                            (redemptionInsertError.message.includes("unique") ||
                                redemptionInsertError.message.includes("duplicate") ||
                                redemptionInsertError.message.includes("uniq_redemption_per_customer_code")));

                    if (isUniqueViolation && booking_attempt_id) {
                        const { data: conflictRows } = await supabase
                            .from("discount_redemptions")
                            .select("id, booking_attempt_id, discount_program_id, discount_code_id")
                            .eq("customer_id", customerId)
                            .eq("booking_attempt_id", booking_attempt_id);
                        const sameAttempt = (conflictRows ?? []).some((r) => {
                            const row = r as {
                                discount_program_id?: string | null;
                                discount_code_id?: string | null;
                            };
                            if (discount_program_id && row.discount_program_id === discount_program_id) return true;
                            if (discount_code_id && row.discount_code_id === discount_code_id) return true;
                            return false;
                        });
                        if (sameAttempt) {
                            console.log(
                                "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_CONFLICT_IDEMPOTENT_OK] booking_attempt_id=%s customer_id=%s",
                                booking_attempt_id,
                                customerId
                            );
                        } else {
                            console.log(
                                "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_CONFLICT] booking_attempt_id=%s customer_id=%s discount_code_id=%s discount_program_id=%s",
                                booking_attempt_id ?? "None",
                                customerId,
                                discount_code_id ?? "None",
                                discount_program_id ?? "None"
                            );
                            return NextResponse.json(
                                {
                                    ok: false,
                                    message: "That promo code has already been used for this customer.",
                                    reason: "discount_already_used",
                                    booking_attempt_id: booking_attempt_id ?? null,
                                },
                                { status: 409 }
                            );
                        }
                    } else if (isUniqueViolation) {
                        console.log(
                            "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_CONFLICT] booking_attempt_id=%s customer_id=%s discount_code_id=%s discount_program_id=%s",
                            booking_attempt_id ?? "None",
                            customerId,
                            discount_code_id ?? "None",
                            discount_program_id ?? "None"
                        );
                        return NextResponse.json(
                            {
                                ok: false,
                                message: "That promo code has already been used for this customer.",
                                reason: "discount_already_used",
                                booking_attempt_id: booking_attempt_id ?? null,
                            },
                            { status: 409 }
                        );
                    } else {
                        console.error(
                            "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_FAIL] booking_attempt_id=",
                            booking_attempt_id,
                            "error=",
                            redemptionInsertError
                        );
                        return NextResponse.json(
                            {
                                ok: false,
                                message: "Failed to record discount redemption.",
                                booking_attempt_id: booking_attempt_id ?? null,
                            },
                            { status: 500 }
                        );
                    }
                } else {
                    console.log(
                        "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_AFTER] booking_attempt_id=%s redemption_id=%s discount_code_id=%s discount_program_id=%s",
                        booking_attempt_id ?? "None",
                        redemptionRow?.id ?? "?",
                        discount_code_id ?? "None",
                        discount_program_id ?? "None"
                    );
                }
            }
        }

        // Step 5c: If recurring, ensure customer_subscriptions row (cadence+interval) and get subscription id for schedule linkage
        let customerSubscriptionId: string | null = null;
        if (is_recurring) {
            console.log(
                `[BOOK_V2_CONFIRM] recurring_booking_detected service_frequency_key=${service_frequency_key} verticalId=${verticalId ?? "missing"} customer_id=${customerId} booking_attempt_id=${booking_attempt_id ?? "none"}`
            );
            const cadenceInterval = getCadenceIntervalFromServiceFrequencyKey(service_frequency_key);
            const orgIdSub = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
            if (!verticalId) {
                console.warn("[BOOK_V2_CONFIRM] recurring booking but verticalId missing; cannot create customer_subscriptions", {
                    service_frequency_key,
                    booking_attempt_id: booking_attempt_id ?? null,
                    customerId,
                });
            } else if (!cadenceInterval) {
                console.warn(
                    "[BOOK_V2_CONFIRM] is_recurring but service_frequency_key has no cadence mapping; customer_subscription_id will be null (next schedule generation will not run)",
                    { service_frequency_key, booking_attempt_id: booking_attempt_id ?? null, customerId }
                );
            } else if (!orgIdSub) {
                console.warn("[BOOK_V2_CONFIRM] recurring booking but ALLOY_PUBLIC_ORG_ID unset; cannot insert customer_subscriptions", {
                    booking_attempt_id: booking_attempt_id ?? null,
                    customerId,
                });
            } else {
                const { cadence, interval } = cadenceInterval;
                const slotParsed = slot_start ? new Date(slot_start) : null;
                const startDate =
                    slotParsed && !Number.isNaN(slotParsed.getTime())
                        ? slotParsed.toISOString().slice(0, 10)
                        : new Date().toISOString().slice(0, 10);
                const { data: existingSub } = await supabase
                    .from("customer_subscriptions")
                    .select("id")
                    .eq("org_id", orgIdSub)
                    .eq("customer_id", customerId)
                    .eq("vertical_id", verticalId)
                    .eq("cadence", cadence)
                    .eq("interval", interval)
                    .eq("status", "active")
                    .maybeSingle();
                if (existingSub?.id) {
                    customerSubscriptionId = existingSub.id;
                    console.log(
                        `[BOOK_V2_CONFIRM] subscription_reuse recurring=true service_frequency_key=${service_frequency_key} cadence=${cadence} interval=${interval} customer_subscription_id=${customerSubscriptionId} customer_id=${customerId} booking_attempt_id=${booking_attempt_id ?? "none"}`
                    );
                } else {
                    const { data: newSub, error: subErr } = await supabase
                        .from("customer_subscriptions")
                        .insert({
                            org_id: orgIdSub,
                            customer_id: customerId,
                            vertical_id: verticalId,
                            cadence,
                            interval,
                            status: "active",
                            start_date: startDate,
                        })
                        .select("id")
                        .single();
                    if (subErr) {
                        console.error("[BOOK_V2_CONFIRM] customer_subscriptions insert failed", {
                            message: subErr.message,
                            code: subErr.code,
                            service_frequency_key,
                            cadence,
                            interval,
                            customerId,
                            verticalId,
                            booking_attempt_id: booking_attempt_id ?? null,
                        });
                    } else if (newSub?.id) {
                        customerSubscriptionId = newSub.id;
                        console.log(
                            `[BOOK_V2_CONFIRM] subscription_created recurring=true service_frequency_key=${service_frequency_key} cadence=${cadence} interval=${interval} customer_subscription_id=${customerSubscriptionId} customer_id=${customerId} booking_attempt_id=${booking_attempt_id ?? "none"}`
                        );
                    }
                }
            }
        }

        /** First schedule: net first-visit amount (matches jobs.estimated_total_cents when set from quote). */
        const schedulePriceCents = netFirstVisitCents;

        // Step 6: Create schedule
        // Reuse only if same start_at, end_at, timezone AND metadata.booking_attempt_id === booking_attempt_id. Otherwise create new row.
        const { data: existingSchedules, error: scheduleSearchError } = await supabase
            .from("schedules")
            .select("id, start_at, end_at, timezone, metadata, customer_subscription_id")
            .eq("job_id", jobId);

        if (scheduleSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for schedule booking_attempt_id=", booking_attempt_id, scheduleSearchError);
            return NextResponse.json(
                { ok: false, message: "Failed to search for schedule", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const existingSchedule =
            existingSchedules?.find(
                (s) =>
                    s.start_at === slot_start &&
                    s.end_at === slot_end &&
                    s.timezone === timezone &&
                    booking_attempt_id &&
                    (s.metadata as Record<string, unknown> | null)?.booking_attempt_id === booking_attempt_id
            ) ?? null;

        let scheduleId: string;
        if (existingSchedule) {
            scheduleId = existingSchedule.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing schedule booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId}`);

            // Update schedule (keep metadata.booking_attempt_id); link subscription if first time
            const existingScheduleMeta = (existingSchedule.metadata as Record<string, unknown>) || {};
            const updatePayload: Record<string, unknown> = {
                start_at: slot_start,
                end_at: slot_end,
                duration_minutes: 120,
                timezone,
                schedule_status_id: bookingScheduleStatusId,
                status_key: bookingScheduleStatusKey,
                metadata: { ...existingScheduleMeta, booking_attempt_id: booking_attempt_id ?? undefined },
            };
            if (schedulePriceCents != null) updatePayload.price_cents = schedulePriceCents;
            if (locationId != null) updatePayload.location_id = locationId;
            if (customerSubscriptionId && !(existingSchedule as { customer_subscription_id?: string | null }).customer_subscription_id) {
                updatePayload.customer_subscription_id = customerSubscriptionId;
                updatePayload.subscription_sequence = 1;
                console.log(
                    `[BOOK_V2_CONFIRM] schedule_subscription_link schedule_id=${scheduleId} customer_subscription_id=${customerSubscriptionId} subscription_sequence=1 booking_attempt_id=${booking_attempt_id ?? "none"}`
                );
            }
            const { error: scheduleUpdateError } = await supabase
                .from("schedules")
                .update(updatePayload)
                .eq("id", scheduleId);

            if (scheduleUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update schedule booking_attempt_id=", booking_attempt_id, scheduleUpdateError);
                return NextResponse.json(
                    { ok: false, message: "Failed to update schedule", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
        } else {
            // Create new schedule
            const scheduleInsert: Record<string, unknown> = {
                org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                job_id: jobId,
                start_at: slot_start,
                end_at: slot_end,
                duration_minutes: 120,
                timezone,
                schedule_status_id: bookingScheduleStatusId,
                status_key: bookingScheduleStatusKey,
                ...(schedulePriceCents != null && { price_cents: schedulePriceCents }),
                ...(locationId != null && { location_id: locationId }),
                metadata: { booking_attempt_id: booking_attempt_id ?? undefined },
            };
            if (customerSubscriptionId) {
                scheduleInsert.customer_subscription_id = customerSubscriptionId;
                scheduleInsert.subscription_sequence = 1;
                console.log(
                    `[BOOK_V2_CONFIRM] schedule_subscription_link schedule=new_insert customer_subscription_id=${customerSubscriptionId} subscription_sequence=1 booking_attempt_id=${booking_attempt_id ?? "none"}`
                );
            }
            const { data: newSchedule, error: scheduleError } = await supabase
                .from("schedules")
                .insert(scheduleInsert)
                .select("id")
                .single();

            if (scheduleError) {
                // Check if it's a conflict error
                if (scheduleError.code === "23505" || scheduleError.message?.includes("conflict")) {
                    console.error("[BOOK_V2_CONFIRM] Schedule conflict detected booking_attempt_id=", booking_attempt_id, scheduleError);
                    return NextResponse.json(
                        { ok: false, message: "This time slot is no longer available. Please select another time.", booking_attempt_id: booking_attempt_id ?? null },
                        { status: 409 }
                    );
                }

                console.error("[BOOK_V2_CONFIRM] Failed to create schedule booking_attempt_id=", booking_attempt_id, scheduleError);
                return NextResponse.json(
                    { ok: false, message: "Failed to create schedule", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }

            if (!newSchedule) {
                console.error("[BOOK_V2_CONFIRM] Schedule creation returned no data booking_attempt_id=", booking_attempt_id);
                return NextResponse.json(
                    { ok: false, message: "Failed to create schedule", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }

            scheduleId = newSchedule.id;
            console.log(`[BOOK_V2_CONFIRM] Created new schedule booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId}`);
        }
        bookV2PerfLog("job_schedule_redemption_subscription", tJobSchedBlock, booking_attempt_id ?? null);

        // Step 8: Integrity check - verify all linkages
        const tIntegrity = typeof performance !== "undefined" ? performance.now() : Date.now();
        const { data: integrityCheck, error: integrityError } = await supabase
            .from("schedules")
            .select(`
                id,
                job_id,
                location_id,
                start_at,
                end_at,
                timezone,
                duration_minutes,
                jobs!inner(
                    id,
                    customer_id,
                    primary_person_id,
                    opportunity_id,
                    vertical_id,
                    location_id,
                    opportunities!inner(
                        id,
                        customer_id,
                        primary_person_id,
                        vertical_id,
                        location_id
                    )
                )
            `)
            .eq("id", scheduleId)
            .single();

        if (integrityError || !integrityCheck) {
            console.error(
                `[BOOK_V2_CONFIRM_INTEGRITY_FAIL] booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId} error=${integrityError?.message || "not found"}`
            );
            return NextResponse.json(
                { ok: false, message: "Booking integrity check failed", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const job = integrityCheck.jobs as any;
        const opportunity = job?.opportunities as any;

        // primary_person_id is required for book-v2 correctness.
        const integrityIssues: string[] = [];
        if (job?.customer_id !== customerId) {
            integrityIssues.push(`job.customer_id mismatch: expected=${customerId} actual=${job?.customer_id}`);
        }
        if ((job as { primary_person_id?: string | null })?.primary_person_id !== personIdFromQuote) {
            integrityIssues.push(`job.primary_person_id mismatch: expected=${personIdFromQuote} actual=${(job as { primary_person_id?: string | null })?.primary_person_id}`);
        }
        if ((opportunity as { primary_person_id?: string | null })?.primary_person_id !== personIdFromQuote) {
            integrityIssues.push(`opportunity.primary_person_id mismatch: expected=${personIdFromQuote} actual=${(opportunity as { primary_person_id?: string | null })?.primary_person_id}`);
        }
        if (job?.opportunity_id !== opportunityId) {
            integrityIssues.push(`job.opportunity_id mismatch: expected=${opportunityId} actual=${job?.opportunity_id}`);
        }
        if (opportunity?.customer_id !== customerId) {
            integrityIssues.push(`opportunity.customer_id mismatch: expected=${customerId} actual=${opportunity?.customer_id}`);
        }
        if (job?.id !== jobId) {
            integrityIssues.push(`schedule.job_id mismatch: expected=${jobId} actual=${job?.id}`);
        }
        if (locationId != null) {
            const schedLoc = (integrityCheck as { location_id?: string | null }).location_id;
            const jobLoc = job?.location_id;
            const oppLoc = opportunity?.location_id;
            if (schedLoc !== locationId) {
                integrityIssues.push(`schedule.location_id mismatch: expected=${locationId} actual=${schedLoc}`);
            }
            if (jobLoc !== locationId) {
                integrityIssues.push(`job.location_id mismatch: expected=${locationId} actual=${jobLoc}`);
            }
            if (oppLoc !== locationId) {
                integrityIssues.push(`opportunity.location_id mismatch: expected=${locationId} actual=${oppLoc}`);
            }
        }
        if (!integrityCheck.start_at || !integrityCheck.end_at || !integrityCheck.timezone) {
            integrityIssues.push(`schedule missing required fields: start_at=${!!integrityCheck.start_at} end_at=${!!integrityCheck.end_at} timezone=${!!integrityCheck.timezone}`);
        }

        if (integrityIssues.length > 0) {
            console.error(
                `[BOOK_V2_CONFIRM_INTEGRITY_FAIL] booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} person_id=${personIdFromQuote} customer_id=${customerId} issues=${JSON.stringify(integrityIssues)}`
            );
            return NextResponse.json(
                { ok: false, message: `Booking integrity check failed: ${integrityIssues.join("; ")}`, booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        // Log integrity success
        console.log(
            `[BOOK_V2_CONFIRM_INTEGRITY_OK] booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} person_id=${personIdFromQuote} customer_id=${customerId} start_at=${integrityCheck.start_at} end_at=${integrityCheck.end_at} timezone=${integrityCheck.timezone} duration_minutes=${integrityCheck.duration_minutes}`
        );
        bookV2PerfLog("integrity_check", tIntegrity, booking_attempt_id ?? null);

        let hasSavedPaymentMethod = false;
        let paymentMethodBrand: string | null = null;
        let paymentMethodLast4: string | null = null;

        const tPersistSync = typeof performance !== "undefined" ? performance.now() : Date.now();
        const resolvedPmId = await resolveStripePaymentMethodId({
            paymentMethodFromBody: stripe_payment_method_id,
            setupIntentIdFromBody: stripe_setup_intent_id,
        });
        console.log(
            `[BOOKING_PAYMENT_METHOD] confirm after_integrity resolved_pm=${resolvedPmId ? "yes" : "no"} will_persist=${!!resolvedPmId}`
        );

        if (resolvedPmId) {
            await persistBookingPaymentMethod(supabase, {
                customerId,
                stripePaymentMethodId: resolvedPmId,
                setupIntentId: stripe_setup_intent_id,
            });
        } else {
            console.warn(
                `[BOOKING_PAYMENT_METHOD] confirm skipping persistBookingPaymentMethod: could not resolve pm_ (body_pm=${!!stripe_payment_method_id} body_si=${!!stripe_setup_intent_id})`
            );
        }
        bookV2PerfLog("sync_persist_payment", tPersistSync, booking_attempt_id ?? null);

        if (customerId) {
            const { data: customerAfterPm } = await supabase
                .from("customers")
                .select("default_payment_method_id, payment_method_brand, payment_method_last4")
                .eq("id", customerId)
                .maybeSingle();
            if (customerAfterPm) {
                hasSavedPaymentMethod = !!(customerAfterPm as { default_payment_method_id?: string | null }).default_payment_method_id;
                paymentMethodBrand = (customerAfterPm as { payment_method_brand?: string | null }).payment_method_brand || null;
                paymentMethodLast4 = (customerAfterPm as { payment_method_last4?: string | null }).payment_method_last4 || null;
            }
        }

        after(() =>
            runDeferredBookingEffects({
                booking_attempt_id: booking_attempt_id ?? null,
                jobId,
                opportunityId,
                scheduleId,
                customerId,
                personIdFromQuote,
                slot_start,
                slot_end,
                timezone,
            })
        );

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] booking_attempt_id=${booking_attempt_id ?? "None"} person_id=${personIdFromQuote} customer_id=${customerId} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total} has_saved_payment_method=${hasSavedPaymentMethod}`
        );
        bookV2PerfLog("confirm_total_to_response", confirmRouteT0, booking_attempt_id ?? null);

        return NextResponse.json({
            ok: true,
            person_id: personIdFromQuote,
            customer_id: customerId,
            opportunity_id: opportunityId,
            job_id: jobId,
            schedule_id: scheduleId,
            has_saved_payment_method: hasSavedPaymentMethod,
            payment_method_brand: paymentMethodBrand,
            payment_method_last4: paymentMethodLast4,
            booking_attempt_id: booking_attempt_id ?? null,
        });
    } catch (error: any) {
        console.error("[BOOK_V2_CONFIRM_ERROR] booking_attempt_id=", bookingAttemptId, error);
        return NextResponse.json(
            {
                ok: false,
                message: error.message || "Failed to confirm booking",
                booking_attempt_id: bookingAttemptId,
            },
            { status: 500 }
        );
    }
}
