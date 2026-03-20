import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { resolve_or_create_contact_and_customer } from "@/lib/bookingResolver";
import { ensureCanonicalBookingLocation } from "@/lib/bookingLocations";
import {
    BOOKED_PIPELINE_STAGE_ID,
    BOOKING_CONFIRM_JOB_STATUS_ID,
    BOOKING_CONFIRM_JOB_STATUS_KEY,
    BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
    BOOKING_CONFIRM_SCHEDULE_STATUS_ID,
    BOOKING_CONFIRM_SCHEDULE_STATUS_KEY,
} from "@/lib/book-v2/bookingConstants";
import { persistBookingPaymentMethod, resolveStripePaymentMethodId } from "@/lib/book-v2/persistBookingPaymentMethod";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
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

const CONFIRM_SAFE_PAYLOAD_KEYS = ["org_id", "person_id", "customer_id", "first_name", "last_name", "email", "phone", "status", "name", "vertical_id", "primary_contact_id", "metadata", "contact_id"] as const;

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
              .select("id")
              .eq("discount_program_id", discount_program_id)
              .eq("customer_id", customerId)
              .limit(1)
              .maybeSingle()
        : Promise.resolve({ data: null, error: null as null });
    const codeQ = discount_code_id
        ? supabase
              .from("discount_redemptions")
              .select("id")
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
        if (existingProgram) {
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
        if (existingCode) {
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
    contactId: string | null;
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
        contactId,
        personIdFromQuote,
        slot_start,
        slot_end,
        timezone,
    } = params;
    const tDeferred = typeof performance !== "undefined" ? performance.now() : Date.now();
    const supa = createServiceRoleClient();
    const orgIdForWorkflows = process.env.ALLOY_PUBLIC_ORG_ID ?? null;

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
        const [jobRes, oppRes, customerRes, scheduleRes, contactRes, personRes] = await Promise.all([
            supa.from("jobs").select("*").eq("id", jobId).single(),
            supa.from("opportunities").select("*").eq("id", opportunityId).single(),
            supa.from("customers").select("*").eq("id", customerId).single(),
            supa.from("schedules").select("*").eq("id", scheduleId).single(),
            contactId ? supa.from("contacts").select("*").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null as null }),
            personIdFromQuote
                ? supa.from("persons").select("id, first_name, last_name, email, phone").eq("id", personIdFromQuote).maybeSingle()
                : Promise.resolve({ data: null as null }),
        ]);
        bookV2PerfLog("deferred_payload_hydrate_parallel", tHydrate, booking_attempt_id);

        const jobRow = jobRes.data;
        const oppRow = oppRes.data;
        const customerRow = customerRes.data;
        const scheduleRow = scheduleRes.data;
        const contactRow = (contactRes as { data: Record<string, unknown> | null }).data as Record<string, unknown> | null;
        let personRow = (personRes as { data: Record<string, unknown> | null }).data as Record<string, unknown> | null;

        if (!personRow && contactRow && (contactRow as { person_id?: string | null }).person_id) {
            const { data: p } = await supa
                .from("persons")
                .select("id, first_name, last_name, email, phone")
                .eq("id", (contactRow as { person_id: string }).person_id)
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

        const eventPayload: Record<string, unknown> = {
            event_type: "booking_confirmed",
            occurred_at: new Date().toISOString(),
            org_id: orgIdForWorkflows,
            booked_stage_id: BOOKED_PIPELINE_STAGE_ID,
            job: jobRow ?? null,
            contact: contactRow ?? null,
            person: personRow ?? null,
            customer: customerRow ?? null,
            opportunity: oppRow ?? null,
            schedule: normalizedSchedule,
        };

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
 * Ensure person has a customer and customer_persons link. Optionally create a compatibility Contact for downstream (discount_redemptions, workflows).
 * Returns { customerId, contactId }. contactId is set when a compatibility contact is created or when person is already linked to a contact-backed customer.
 */
async function ensureCustomerForPersonInConfirm(
    supabase: Supabase,
    personId: string,
    params: { vertical_id: string; org_id: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null },
    createCompatibilityContact: boolean
): Promise<{ customerId: string; contactId: string | null }> {
    const { data: person } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, org_id")
        .eq("id", personId)
        .single();
    if (!person) throw new Error("Person not found");
    const p = person as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; org_id?: string | null };
    const contactOrgId = p.org_id ?? params.org_id;

    // Existing customer via customer_persons?
    const { data: cp } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    console.log("[BOOK_V2_CONFIRM] ensureCustomerForPersonInConfirm path: person_id=%s contactOrgId=%s customer_persons=%s", personId, contactOrgId ?? null, cp?.customer_id ?? "none");
    if (cp?.customer_id) {
        const customerId = (cp as { customer_id: string }).customer_id;
        const { data: cust } = await supabase.from("customers").select("primary_contact_id").eq("id", customerId).single();
        const primaryContactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
        return { customerId, contactId: primaryContactId };
    }

    // Reuse existing contact/customer when contact already linked (e.g. from ensure-customer at payment)
    if (contactOrgId) {
        const email = params.email ?? p.email ?? null;
        const phone = params.phone ?? p.phone ?? null;
        let existingContact: { id: string; customer_id?: string | null } | null = null;
        if (email && String(email).trim()) {
            const { data: byEmail } = await supabase
                .from("contacts")
                .select("id, customer_id")
                .eq("org_id", contactOrgId)
                .ilike("email", String(email).trim())
                .limit(1)
                .maybeSingle();
            if (byEmail?.id) existingContact = byEmail as { id: string; customer_id?: string | null };
        }
        if (!existingContact && phone && String(phone).trim()) {
            const { data: byPhone } = await supabase
                .from("contacts")
                .select("id, customer_id")
                .eq("org_id", contactOrgId)
                .eq("phone", String(phone).trim())
                .limit(1)
                .maybeSingle();
            if (byPhone?.id) existingContact = byPhone as { id: string; customer_id?: string | null };
        }
        if (existingContact?.id) {
            let customerId: string | null = existingContact.customer_id ?? null;
            if (!customerId) {
                const { data: custByContact } = await supabase.from("customers").select("id").eq("primary_contact_id", existingContact.id).limit(1).maybeSingle();
                customerId = (custByContact as { id: string } | null)?.id ?? null;
            }
            console.log("[BOOK_V2_CONFIRM] Existing contact reuse: contact_id=%s contact.customer_id=%s resolved_customerId=%s", existingContact.id, existingContact.customer_id ?? "null", customerId ?? "null");
            if (customerId) {
                const { data: existingCp } = await supabase.from("customer_persons").select("id").eq("customer_id", customerId).eq("person_id", personId).maybeSingle();
                if (!existingCp) {
                    const cpInsert = { customer_id: customerId, person_id: personId, org_id: contactOrgId, role_type: "primary_contact", is_primary: true };
                    const { error: cpErr } = await supabase.from("customer_persons").insert(cpInsert);
                    if (cpErr) {
                        console.error("[BOOK_V2_CONFIRM] customer_persons insert failed (reuse existing customer)", {
                            error_message: (cpErr as { message?: string }).message,
                            error_code: (cpErr as { code?: string }).code,
                            error_details: (cpErr as { details?: string }).details,
                            error_hint: (cpErr as { hint?: string }).hint,
                            payload: cpInsert,
                        });
                        throw new Error(`Failed to link person to customer: ${(cpErr as { message?: string }).message ?? cpErr} (code: ${(cpErr as { code?: string }).code ?? "unknown"})`);
                    }
                }
                return { customerId, contactId: existingContact.id };
            }
        }
    }

    const name = [params.first_name ?? p.first_name, params.last_name ?? p.last_name].filter(Boolean).join(" ").trim()
        || (params.email ?? p.email) || (params.phone ?? p.phone) || "New Customer";

    let contactId: string | null = null;
    if (createCompatibilityContact) {
        const contactInsert: Record<string, unknown> = {
            first_name: params.first_name ?? p.first_name,
            last_name: params.last_name ?? p.last_name,
            email: params.email ?? p.email ?? null,
            phone: params.phone ?? p.phone ?? null,
            person_id: personId,
            contact_type: "lead",
        };
        if (params.org_id) contactInsert.org_id = params.org_id;
        console.log("[BOOK_V2_CONFIRM] Compatibility contact insert attempt", confirmSafePayload(contactInsert as Record<string, unknown>));
        const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert(contactInsert)
            .select("id")
            .single();
        if (contactErr) {
            console.error("[BOOK_V2_CONFIRM] compatibility contact insert failed", {
                error_message: (contactErr as { message?: string }).message,
                error_code: (contactErr as { code?: string }).code,
                error_details: (contactErr as { details?: string }).details,
                error_hint: (contactErr as { hint?: string }).hint,
                payload: confirmSafePayload(contactInsert as Record<string, unknown>),
            });
            throw new Error(`Compatibility contact insert failed: ${(contactErr as { message?: string }).message ?? contactErr} (code: ${(contactErr as { code?: string }).code ?? "unknown"})`);
        }
        if (newContact) contactId = (newContact as { id: string }).id;
    }

    const payload: Record<string, unknown> = {
        name,
        status: "active",
        vertical_id: params.vertical_id,
        metadata: { source: "book-v2-confirm", email: params.email ?? p.email ?? undefined, phone: params.phone ?? p.phone ?? undefined },
    };
    if (params.org_id) payload.org_id = params.org_id;
    if (contactId) payload.primary_contact_id = contactId;

    console.log("[BOOK_V2_CONFIRM] customer insert (ensureCustomerForPersonInConfirm)", confirmSafePayload({ ...payload, person_id: personId }));
    const { data: newCustomer, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505" && contactId) {
            const { data: existing } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
            if (existing?.id) {
                console.log("[BOOK_V2_CONFIRM] Reusing customer after 23505", { existing_customer_id: existing.id, contact_id: contactId });
                await supabase.from("contacts").update({ customer_id: existing.id }).eq("id", contactId);
                const { data: existingCp } = await supabase.from("customer_persons").select("id").eq("customer_id", existing.id).eq("person_id", personId).maybeSingle();
                if (!existingCp) {
                    const cpInsert = { customer_id: existing.id, person_id: personId, org_id: params.org_id, role_type: "primary_contact", is_primary: true };
                    const { error: cpErr } = await supabase.from("customer_persons").insert(cpInsert);
                    if (cpErr) {
                        console.error("[BOOK_V2_CONFIRM] customer_persons insert failed (23505 reuse)", {
                            error_message: (cpErr as { message?: string }).message,
                            error_code: (cpErr as { code?: string }).code,
                            error_details: (cpErr as { details?: string }).details,
                            error_hint: (cpErr as { hint?: string }).hint,
                            payload: cpInsert,
                        });
                        throw new Error(`Failed to link person to customer: ${(cpErr as { message?: string }).message ?? cpErr} (code: ${(cpErr as { code?: string }).code ?? "unknown"})`);
                    }
                }
                return { customerId: (existing as { id: string }).id, contactId };
            }
        }
        logAndThrowConfirmError("customer insert (ensureCustomerForPersonInConfirm)", insErr, payload as Record<string, unknown>);
    }
    const customerId = (newCustomer as { id: string }).id;
    if (contactId) {
        await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
    }
    const cpInsert = { customer_id: customerId, person_id: personId, org_id: params.org_id, role_type: "primary_contact", is_primary: true };
    const { error: cpErr } = await supabase.from("customer_persons").insert(cpInsert);
    if (cpErr) {
        console.error("[BOOK_V2_CONFIRM] customer_persons insert failed (ensureCustomerForPersonInConfirm)", {
            error_message: (cpErr as { message?: string }).message,
            error_code: (cpErr as { code?: string }).code,
            error_details: (cpErr as { details?: string }).details,
            error_hint: (cpErr as { hint?: string }).hint,
            payload: cpInsert,
        });
        throw new Error(`Failed to link person to customer: ${(cpErr as { message?: string }).message ?? cpErr} (code: ${(cpErr as { code?: string }).code ?? "unknown"})`);
    }
    return { customerId, contactId };
}

/**
 * Ensure contact has a customer; create and link if missing. When contact has person_id, create customer_persons link.
 * Used at confirm when quote path has no customer yet (Pass 1 lifecycle) and we have a contact (legacy path).
 */
async function ensureCustomerForContactInConfirm(
    supabase: Supabase,
    contactId: string,
    params: { vertical_id: string; org_id: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }
): Promise<string> {
    const { data: contact } = await supabase
        .from("contacts")
        .select("id, customer_id, person_id, first_name, last_name, email, phone")
        .eq("id", contactId)
        .single();
    if (!contact) throw new Error("Contact not found");
    const c = contact as { customer_id?: string | null; person_id?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };
    if (c.customer_id) return c.customer_id;

    const name = [params.first_name ?? c.first_name, params.last_name ?? c.last_name].filter(Boolean).join(" ").trim()
        || (params.email ?? c.email) || (params.phone ?? c.phone) || "New Customer";
    const payload: Record<string, unknown> = {
        name,
        primary_contact_id: contactId,
        status: "active",
        vertical_id: params.vertical_id,
        metadata: { source: "book-v2-confirm", email: params.email ?? c.email ?? undefined, phone: params.phone ?? c.phone ?? undefined },
    };
    if (params.org_id) payload.org_id = params.org_id;

    console.log("[BOOK_V2_CONFIRM] customer insert (ensureCustomerForContactInConfirm)", confirmSafePayload({ ...payload, contact_id: contactId }));
    const { data: newCustomer, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505") {
            const { data: existing } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
            if (existing?.id) {
                console.log("[BOOK_V2_CONFIRM] Reusing customer after 23505 (contact path)", { existing_customer_id: existing.id, contact_id: contactId });
                await supabase.from("contacts").update({ customer_id: existing.id }).eq("id", contactId);
                return existing.id;
            }
        }
        logAndThrowConfirmError("customer insert (ensureCustomerForContactInConfirm)", insErr, payload as Record<string, unknown>);
    }
    const customerId = (newCustomer as { id: string }).id;
    await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);

    if (c.person_id && params.org_id) {
        const { data: existingCp } = await supabase
            .from("customer_persons")
            .select("id")
            .eq("customer_id", customerId)
            .eq("person_id", c.person_id)
            .maybeSingle();
        if (!existingCp) {
            const cpInsert = { customer_id: customerId, person_id: c.person_id, org_id: params.org_id, role_type: "primary_contact", is_primary: true };
            const { error: cpErr } = await supabase.from("customer_persons").insert(cpInsert);
            if (cpErr) {
                console.error("[BOOK_V2_CONFIRM] customer_persons insert failed (ensureCustomerForContactInConfirm)", {
                    error_message: (cpErr as { message?: string }).message,
                    error_code: (cpErr as { code?: string }).code,
                    error_details: (cpErr as { details?: string }).details,
                    error_hint: (cpErr as { hint?: string }).hint,
                    payload: cpInsert,
                });
                throw new Error(`Failed to link person to customer: ${(cpErr as { message?: string }).message ?? cpErr} (code: ${(cpErr as { code?: string }).code ?? "unknown"})`);
            }
        }
    }
    return customerId;
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
    if (normalized.includes("weekly") || normalized === "weekly") {
        return "weekly";
    }
    if (normalized.includes("bi-weekly") || normalized.includes("biweekly") || normalized.includes("every 2 weeks")) {
        return "biweekly";
    }
    if (normalized.includes("monthly") || normalized === "monthly") {
        return "monthly";
    }
    if (normalized.includes("quarterly") || normalized === "quarterly") {
        return "quarterly";
    }
    
    // Default fallback
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
            access_method,
            access_note,
            additional_notes,
            frequency_label = "One-time",
            first_clean_price,
            recurring_price,
            quote_input,
            quote_output,
            booking_attempt_id = bookingAttemptId,
            opportunity_id: opportunity_id_from_quote,
            contact_id: contact_id_from_quote,
            person_id: person_id_from_quote,
            customer_id: customer_id_from_quote,
            stripe_payment_method_id: stripe_pm_body,
            stripe_setup_intent_id: stripe_si_body,
            payment_method_id: payment_method_id_body,
        } = body;

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

        const discount_program_id =
            typeof discount_program_id_raw === "string" && discount_program_id_raw.trim()
                ? discount_program_id_raw.trim()
                : null;

        const service_frequency_key = normalizeFrequencyKey(frequency_label);
        const is_recurring = service_frequency_key !== "one_time";
        const firstCleanCents = typeof first_clean_price === "number" && first_clean_price > 0
            ? Math.round(first_clean_price * 100)
            : null;
        const recurringCents = is_recurring && typeof recurring_price === "number" && recurring_price > 0
            ? Math.round(recurring_price * 100)
            : null;
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
        const hasContactId = !!contact_id_from_quote;
        const hasPersonId = !!person_id_from_quote;
        const hasEmailAndPhone = !!(contact_email?.trim() && contact_phone?.trim());
        if (!hasContactId && !hasPersonId && !hasEmailAndPhone) {
            return NextResponse.json(
                { ok: false, message: "Provide person_id or contact_id (from quote) or both contact_email and contact_phone", booking_attempt_id: booking_attempt_id ?? null },
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
        const confirmRouteT0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        bookV2PerfLog("confirm_route_entry", confirmRouteT0, booking_attempt_id ?? null);

        const useQuoteIds =
            !!(opportunity_id_from_quote && (person_id_from_quote || contact_id_from_quote));

        let contactId: string | null = null;
        let customerId!: string;
        let opportunityId!: string;
        let verticalId!: string;
        let jobDate!: string;
        let jobTimeWindow!: string;
        let personIdFromQuote: string | null = person_id_from_quote ?? null;

        if (useQuoteIds) {
            const { data: opp, error: oppVerifyErr } = await supabase
                .from("opportunities")
                .select("id, primary_person_id, primary_contact_id, customer_id, vertical_id, org_id")
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
            const oppPrimaryContactId = (opp as { primary_contact_id?: string | null }).primary_contact_id ?? null;

            // Person-first path: validate by primary_person_id
            if (person_id_from_quote) {
                if (oppPrimaryPersonId !== person_id_from_quote) {
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
                opportunityId = opportunity_id_from_quote;
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
                if (oppCustomerId) {
                    customerId = oppCustomerId;
                    const { data: cust } = await supabase.from("customers").select("primary_contact_id").eq("id", customerId).single();
                    contactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
                } else {
                    try {
                        const result = await ensureCustomerForPersonInConfirm(supabase, person_id_from_quote, {
                            vertical_id: verticalId,
                            org_id: oppOrgId,
                            first_name: contact_first_name ?? undefined,
                            last_name: contact_last_name ?? undefined,
                            email: contact_email ?? undefined,
                            phone: contact_phone ?? undefined,
                        }, true);
                        customerId = result.customerId;
                        contactId = result.contactId;
                        await supabase.from("opportunities").update({ customer_id: customerId, ...(contactId && { primary_contact_id: contactId }) }).eq("id", opportunityId);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForPersonInConfirm failed", msg, err);
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
                // Legacy contact path: validate by primary_contact_id
                if (oppPrimaryContactId !== contact_id_from_quote) {
                    return NextResponse.json(
                        {
                            ok: false,
                            error: "QUOTE_ID_MISMATCH",
                            message: "Invalid or mismatched opportunity/contact from quote. Please refresh your quote and try again.",
                            action: "CLEAR_QUOTE_AND_RESTART",
                            booking_attempt_id: booking_attempt_id ?? null,
                        },
                        { status: 409 }
                    );
                }
                contactId = contact_id_from_quote;
                opportunityId = opportunity_id_from_quote;
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
                if (oppCustomerId) {
                    customerId = oppCustomerId;
                } else {
                    try {
                        customerId = await ensureCustomerForContactInConfirm(supabase, contact_id_from_quote, {
                            vertical_id: verticalId,
                            org_id: oppOrgId,
                            first_name: contact_first_name ?? undefined,
                            last_name: contact_last_name ?? undefined,
                            email: contact_email ?? undefined,
                            phone: contact_phone ?? undefined,
                        });
                        await supabase.from("opportunities").update({ customer_id: customerId }).eq("id", opportunityId);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForContactInConfirm failed", msg, err);
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
            }

            // Person path: ensure we have a compatibility contact for downstream (discount_redemptions, job.primary_contact_id, etc.)
            if (personIdFromQuote && !contactId) {
                const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone, org_id").eq("id", personIdFromQuote).single();
                if (person) {
                    const p = person as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; org_id?: string | null };
                    const oppOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
                    const contactOrgId = p.org_id ?? oppOrgId;
                    if (contactOrgId) {
                        const personEmail = contact_email ?? p.email ?? null;
                        const personPhone = contact_phone ?? p.phone ?? null;
                        let existingContactId: string | null = null;
                        if (personEmail && String(personEmail).trim()) {
                            const { data: byEmail } = await supabase
                                .from("contacts")
                                .select("id")
                                .eq("org_id", contactOrgId)
                                .ilike("email", String(personEmail).trim())
                                .limit(1)
                                .maybeSingle();
                            if (byEmail?.id) existingContactId = (byEmail as { id: string }).id;
                        }
                        if (!existingContactId && personPhone && String(personPhone).trim()) {
                            const { data: byPhone } = await supabase
                                .from("contacts")
                                .select("id")
                                .eq("org_id", contactOrgId)
                                .eq("phone", String(personPhone).trim())
                                .limit(1)
                                .maybeSingle();
                            if (byPhone?.id) existingContactId = (byPhone as { id: string }).id;
                        }
                        if (existingContactId) {
                            contactId = existingContactId;
                            const contactUpdate: Record<string, unknown> = {
                                person_id: personIdFromQuote,
                                customer_id: customerId,
                                org_id: contactOrgId,
                                status: "active",
                            };
                            await supabase.from("contacts").update(contactUpdate).eq("id", contactId);
                            const { data: cust } = await supabase.from("customers").select("primary_contact_id").eq("id", customerId).single();
                            const primaryContactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
                            if (!primaryContactId) await supabase.from("customers").update({ primary_contact_id: contactId }).eq("id", customerId);
                            await supabase.from("opportunities").update({ primary_contact_id: contactId }).eq("id", opportunityId);
                            const { data: existingCp } = await supabase.from("customer_persons").select("id").eq("customer_id", customerId).eq("person_id", personIdFromQuote).maybeSingle();
                            if (!existingCp) {
                                const { error: cpErr } = await supabase.from("customer_persons").insert({
                                    customer_id: customerId,
                                    person_id: personIdFromQuote,
                                    org_id: contactOrgId,
                                    role_type: "primary_contact",
                                    is_primary: true,
                                });
                                if (cpErr) {
                                    console.error("[BOOK_V2_CONFIRM] customer_persons insert failed", cpErr);
                                }
                            }
                        } else {
                            const contactInsert: Record<string, unknown> = {
                                org_id: contactOrgId,
                                first_name: contact_first_name ?? p.first_name,
                                last_name: contact_last_name ?? p.last_name,
                                email: contact_email ?? p.email ?? null,
                                phone: contact_phone ?? p.phone ?? null,
                                person_id: personIdFromQuote,
                                contact_type: "lead",
                                status: "active",
                            };
                            const { data: newContact, error: contactErr } = await supabase.from("contacts").insert(contactInsert).select("id").single();
                            if (contactErr || !newContact) {
                                const e = contactErr as { message?: string; code?: string; details?: string; hint?: string } | null;
                                const errMsg = e?.message ?? "unknown";
                                const errCode = e?.code ?? "unknown";
                                console.error("[BOOK_V2_CONFIRM] Compatibility contact insert failed", {
                                    error_message: e?.message,
                                    error_code: e?.code,
                                    error_details: e?.details,
                                    error_hint: e?.hint,
                                    payload: {
                                        org_id: contactOrgId,
                                        person_id: personIdFromQuote,
                                        first_name: contact_first_name ?? p.first_name,
                                        last_name: contact_last_name ?? p.last_name,
                                        email: contact_email ?? p.email ?? null,
                                        phone: contact_phone ?? p.phone ?? null,
                                        status: "active",
                                    },
                                });
                                return NextResponse.json(
                                    {
                                        ok: false,
                                        message: `Compatibility contact insert failed: ${errMsg} (code: ${errCode})`,
                                        booking_attempt_id: booking_attempt_id ?? null,
                                    },
                                    { status: 500 }
                                );
                            }
                            contactId = (newContact as { id: string }).id;
                            await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
                            await supabase.from("customers").update({ primary_contact_id: contactId }).eq("id", customerId);
                            await supabase.from("opportunities").update({ primary_contact_id: contactId }).eq("id", opportunityId);
                            const { data: existingCp2 } = await supabase.from("customer_persons").select("id").eq("customer_id", customerId).eq("person_id", personIdFromQuote).maybeSingle();
                            if (!existingCp2) {
                                const { error: cpErr2 } = await supabase.from("customer_persons").insert({
                                    customer_id: customerId,
                                    person_id: personIdFromQuote,
                                    org_id: contactOrgId,
                                    role_type: "primary_contact",
                                    is_primary: true,
                                });
                                if (cpErr2) console.error("[BOOK_V2_CONFIRM] customer_persons insert failed", cpErr2);
                            }
                        }
                    }
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
            const mergedMetadata: Record<string, unknown> = {
                ...existingMeta,
                booking_source: "book-v2",
                booking_attempt_id: booking_attempt_id ?? undefined,
                timezone,
                address: address ?? null,
                city: city ?? null,
                home_type: home_type ?? null,
                bedrooms: bedrooms ?? null,
                bathrooms: bathrooms ?? null,
                access_method: access_method ?? null,
                access_note: access_note ?? null,
                additional_notes: additional_notes ?? null,
            };
            const normalizedQuoteInput =
                quote_input != null && typeof quote_input === "object"
                    ? { ...quote_input, cleaning_frequency: service_frequency_key }
                    : { cleaning_frequency: service_frequency_key };
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
                pipeline_stage_id: BOOKED_PIPELINE_STAGE_ID,
                status_key: BOOKING_CONFIRM_OPPORTUNITY_STATUS_KEY,
            };
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

        // Step 1: Use provided contact_id if valid, otherwise resolve or create contact and customer
        let contactResolved = false;
        if (contact_id_from_quote) {
            const { data: contactRow, error: contactFetchErr } = await supabase
                .from("contacts")
                .select("*")
                .eq("id", contact_id_from_quote)
                .single();
            if (!contactFetchErr && contactRow) {
                const linkedCustomerId = (contactRow as { customer_id?: string | null }).customer_id ?? customer_id_from_quote ?? null;
                if (linkedCustomerId) {
                    contactId = contact_id_from_quote;
                    customerId = linkedCustomerId;
                    contactResolved = true;
                    console.log(
                        `[BOOK_V2_CONFIRM] Using contact_id from quote booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId}`
                    );
                } else {
                    contactId = contact_id_from_quote;
                    try {
                        customerId = await ensureCustomerForContactInConfirm(supabase, contact_id_from_quote, {
                            vertical_id: verticalIdElse,
                            org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                            first_name: contact_first_name ?? undefined,
                            last_name: contact_last_name ?? undefined,
                            email: contact_email ?? undefined,
                            phone: contact_phone ?? undefined,
                        });
                        contactResolved = true;
                        console.log(
                            `[BOOK_V2_CONFIRM] Created customer for quote contact booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId}`
                        );
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : "Could not create customer for booking.";
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForContactInConfirm failed (else branch)", msg, err);
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
            }
        }

        if (!contactResolved) {
            const emailPresent = !!(contact_email?.trim());
            const phonePresent = !!(contact_phone?.trim());
            if (process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview") {
                console.warn("[BOOK_V2_CONFIRM] Resolver fallback: missing fields", {
                    booking_attempt_id: booking_attempt_id ?? null,
                    contact_id_provided: !!contact_id_from_quote,
                    email_present: emailPresent,
                    phone_present: phonePresent,
                });
            }
            const emailForResolver = contact_email?.trim() ?? "";
            const phoneForResolver = contact_phone?.trim() ?? "";
            const digits = phoneForResolver.replace(/\D/g, "");
            const normalizedPhone = digits.length === 10 ? "+1" + digits : digits.length === 11 && digits.startsWith("1") ? "+" + digits : phoneForResolver.startsWith("+") ? "+" + digits : phoneForResolver ? "+" + digits : "";
            try {
                const resolverResult = await resolve_or_create_contact_and_customer(supabase, {
                    first_name: contact_first_name,
                    last_name: contact_last_name,
                    email: emailForResolver,
                    phone: normalizedPhone || phoneForResolver,
                    postal_code: undefined,
                    timezone: timezone,
                    address: address,
                    city: city,
                    state: undefined,
                    vertical_key: "cleaning",
                    vertical_id: verticalIdElse,
                    org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                });

                contactId = resolverResult.contact_id;
                customerId = resolverResult.customer_id;

                console.log(
                    `[BOOK_V2_CONFIRM] Contact/Customer resolved booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId} resolution_path=${resolverResult.resolution_path} customer_resolution_path=${resolverResult.customer_resolution_path}`
                );
            } catch (error: unknown) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error("[BOOK_V2_CONFIRM] Failed to resolve contact/customer booking_attempt_id=", booking_attempt_id, "error=", errMsg, "missing_contact_id=", !contact_id_from_quote, "missing_email=", !emailPresent, "missing_phone=", !phonePresent);
                return NextResponse.json(
                    { ok: false, message: `Could not resolve or create contact; check email and phone. ${errMsg}`, booking_attempt_id: booking_attempt_id ?? null },
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

        // Step 3: Use vertical_id we already fetched (else branch)
        const verticalId = verticalIdElse;

        // Step 4: Find or create opportunity
        // Prefer: (1) idempotent retry same booking_attempt_id, (2) reuse recent "Quote Started" + web_quote for this contact (last 30 min), (3) create new.
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentOpps, error: oppSearchError } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_contact_id, metadata, pipeline_stage_id")
            .eq("primary_contact_id", contactId)
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
                .select("vertical_id, customer_id, primary_contact_id, monetary_value_cents, metadata")
                .eq("id", opportunityId)
                .single();

            const estimatedPriceCentsElse =
                quote_total != null ? Math.round(quote_total * 100)
                : quote_subtotal != null ? Math.round(quote_subtotal * 100)
                : first_clean_price != null ? Math.round(first_clean_price * 100)
                : null;
            const existingMetaElse = ((existingOppData?.metadata ?? existingOpp?.metadata) as Record<string, unknown>) ?? {};
            const mergedMetaElse: Record<string, unknown> = {
                ...existingMetaElse,
                booking_source: "book-v2",
                booking_attempt_id: booking_attempt_id ?? undefined,
                timezone,
                address: address ?? null,
                city: city ?? null,
                home_type: home_type ?? null,
                bedrooms: bedrooms ?? null,
                bathrooms: bathrooms ?? null,
                access_method: access_method ?? null,
                access_note: access_note ?? null,
                additional_notes: additional_notes ?? null,
            };
            const normalizedQuoteInputElse =
                quote_input != null && typeof quote_input === "object"
                    ? { ...quote_input, cleaning_frequency: service_frequency_key }
                    : { cleaning_frequency: service_frequency_key };
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
                ...(contactId != null && { primary_contact_id: contactId }),
                ...(personIdFromQuote != null && { primary_person_id: personIdFromQuote }),
                metadata: mergedMetaElse,
                pipeline_stage_id: BOOKED_PIPELINE_STAGE_ID,
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
                home_type: home_type ?? null,
                bedrooms: bedrooms ?? null,
                bathrooms: bathrooms ?? null,
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
                ...(contactId != null && { primary_contact_id: contactId }),
                ...(personIdFromQuote != null && { primary_person_id: personIdFromQuote }),
                customer_id: customerId,
                name: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                status: "open",
                source: "website",
                pipeline_stage_id: BOOKED_PIPELINE_STAGE_ID,
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

        // Step 4b: Canonical location — reuse opportunity.location_id when present (quote stage), else create/link
        const orgIdForLocation = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const { data: oppForLocation } = await supabase
            .from("opportunities")
            .select("metadata, location_id")
            .eq("id", opportunityId)
            .maybeSingle();
        const oppMeta = (oppForLocation?.metadata as Record<string, unknown>) ?? {};
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
            });
        } catch (locErr) {
            console.warn("[BOOK_V2_CONFIRM] ensureCanonicalBookingLocation failed", locErr);
        }
        bookV2PerfLog("canonical_location", tCanonicalLoc, booking_attempt_id ?? null);

        // Step 5: Create or update job
        // Reuse only if existing job has same booking_attempt_id (idempotent retry). Otherwise create new.
        const tJobSchedBlock = typeof performance !== "undefined" ? performance.now() : Date.now();
        const { data: existingJobRow, error: jobSearchError } = await supabase
            .from("jobs")
            .select("id, customer_id, primary_contact_id, metadata, vertical_id, estimated_total_cents, gross_price_cents, service_frequency_key")
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
        const quoteTotalCents = quote_total ? Math.round(quote_total * 100) : null;

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
                ...(personIdFromQuote && { primary_person_id: personIdFromQuote }),
                ...(contactId != null && { primary_contact_id: contactId }),
                is_recurring: is_recurring,
                service_key: "cleaning",
                service_frequency_key: service_frequency_key,
                job_status_id: BOOKING_CONFIRM_JOB_STATUS_ID,
                status_key: BOOKING_CONFIRM_JOB_STATUS_KEY,
                ...(locationId != null && { location_id: locationId }),
                metadata: {
                    ...jobMeta,
                    booking_attempt_id: booking_attempt_id ?? undefined,
                    frequency_label: frequency_label ?? undefined,
                    service_frequency_key: service_frequency_key,
                    home_type: home_type ?? null,
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

            // Pricing: first clean only for estimated_total_cents; recurring_total_cents when recurring
            const effectiveFirstCleanCents = firstCleanCents ?? quoteTotalCents;
            if (effectiveFirstCleanCents != null) {
                if (!existingJobData?.estimated_total_cents) {
                    jobUpdatePayload.estimated_total_cents = effectiveFirstCleanCents;
                }
                if (!existingJobData?.gross_price_cents) {
                    jobUpdatePayload.gross_price_cents = effectiveFirstCleanCents;
                }
            }
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
            const quoteTotalCents = quote_total ? Math.round(quote_total * 100) : null;
            const effectiveFirstCleanCents = firstCleanCents ?? quoteTotalCents;
            const jobPayload: Record<string, any> = {
                org_id: process.env.ALLOY_PUBLIC_ORG_ID ?? null,
                opportunity_id: opportunityId,
                customer_id: customerId,
                ...(personIdFromQuote && { primary_person_id: personIdFromQuote }),
                ...(contactId != null && { primary_contact_id: contactId }),
                vertical_id: verticalId,
                job_status_id: BOOKING_CONFIRM_JOB_STATUS_ID,
                status_key: BOOKING_CONFIRM_JOB_STATUS_KEY,
                ...(locationId != null && { location_id: locationId }),
                title: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                description: `Scheduled cleaning service`,
                scheduled_at: slot_start,
                is_recurring: is_recurring,
                service_key: "cleaning",
                service_frequency_key: service_frequency_key,
                estimated_total_cents: effectiveFirstCleanCents,
                recurring_total_cents: is_recurring ? recurringCents : null,
                ...(effectiveFirstCleanCents != null && { gross_price_cents: effectiveFirstCleanCents }),
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
                    home_type: home_type ?? null,
                    bedrooms: bedrooms || null,
                    bathrooms: bathrooms || null,
                    access_method: access_method || null,
                    access_note: access_note || null,
                    additional_notes: additional_notes || null,
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

        // Step 5b: Persist discount redemption immediately after job creation
        if (discount_code_id || discount_program_id) {
            if (contactId == null) {
                console.error(
                    "[BOOK_V2_CONFIRM] discount redemption requested but contactId is null (discount_redemptions.contact_id required) booking_attempt_id=%s",
                    booking_attempt_id ?? "None"
                );
                return NextResponse.json(
                    { ok: false, message: "Unable to record discount redemption.", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
            console.log(
                "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_BEFORE] booking_attempt_id=%s discount_code_id=%s discount_program_id=%s customer_id=%s contact_id=%s opportunity_id=%s job_id=%s",
                booking_attempt_id ?? "None",
                discount_code_id ?? "None",
                discount_program_id ?? "None",
                customerId,
                contactId,
                opportunityId,
                jobId
            );
            const { data: redemptionRow, error: redemptionInsertError } = await supabase
                .from("discount_redemptions")
                .insert({
                    discount_code_id: discount_code_id ?? null,
                    discount_program_id: discount_program_id ?? null,
                    discount_code: discount_code ?? null,
                    customer_id: customerId,
                    contact_id: contactId,
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
                    (typeof redemptionInsertError.message === "string" && (
                        redemptionInsertError.message.includes("unique") ||
                        redemptionInsertError.message.includes("duplicate") ||
                        redemptionInsertError.message.includes("uniq_redemption_per_customer_code")
                    ));
                if (isUniqueViolation) {
                    console.log(
                        "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_CONFLICT] booking_attempt_id=%s customer_id=%s discount_code_id=%s discount_program_id=%s",
                        booking_attempt_id ?? "None",
                        customerId,
                        discount_code_id ?? "None",
                        discount_program_id ?? "None"
                    );
                    return NextResponse.json(
                        { ok: false, message: "That promo code has already been used for this customer.", reason: "discount_already_used", booking_attempt_id: booking_attempt_id ?? null },
                        { status: 409 }
                    );
                }
                console.error("[BOOK_V2_CONFIRM_REDEMPTION_INSERT_FAIL] booking_attempt_id=", booking_attempt_id, "error=", redemptionInsertError);
                return NextResponse.json(
                    { ok: false, message: "Failed to record discount redemption.", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
            console.log(
                "[BOOK_V2_CONFIRM_REDEMPTION_INSERT_AFTER] booking_attempt_id=%s redemption_id=%s discount_code_id=%s discount_program_id=%s",
                booking_attempt_id ?? "None",
                redemptionRow?.id ?? "?",
                discount_code_id ?? "None",
                discount_program_id ?? "None"
            );
        }

        // Step 5c: If recurring, ensure customer_subscriptions row (cadence+interval) and get subscription id for schedule linkage
        let customerSubscriptionId: string | null = null;
        if (is_recurring && verticalId) {
            const cadenceInterval = getCadenceIntervalFromServiceFrequencyKey(service_frequency_key);
            if (cadenceInterval) {
                const { cadence, interval } = cadenceInterval;
                const orgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
                const { data: existingSub } = await supabase
                    .from("customer_subscriptions")
                    .select("id")
                    .eq("org_id", orgId)
                    .eq("customer_id", customerId)
                    .eq("vertical_id", verticalId)
                    .eq("cadence", cadence)
                    .eq("interval", interval)
                    .eq("status", "active")
                    .maybeSingle();
                if (existingSub?.id) {
                    customerSubscriptionId = existingSub.id;
                } else {
                    const startDate = slot_start ? new Date(slot_start).toISOString().slice(0, 10) : null;
                    const { data: newSub, error: subErr } = await supabase
                        .from("customer_subscriptions")
                        .insert({
                            org_id: orgId,
                            customer_id: customerId,
                            ...(contactId != null && { primary_contact_id: contactId }),
                            vertical_id: verticalId,
                            cadence,
                            interval,
                            status: "active",
                            start_date: startDate,
                        })
                        .select("id")
                        .single();
                    if (!subErr && newSub?.id) customerSubscriptionId = newSub.id;
                }
            }
        }

        /** Net price in cents for this visit (financials + admin use schedule.price_cents when set). */
        const schedulePriceCents =
            quote_total != null && Number.isFinite(Number(quote_total))
                ? Math.round(Number(quote_total) * 100)
                : firstCleanCents ??
                  (quote_subtotal != null && Number.isFinite(Number(quote_subtotal))
                      ? Math.round(Number(quote_subtotal) * 100)
                      : null);

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
                schedule_status_id: BOOKING_CONFIRM_SCHEDULE_STATUS_ID,
                status_key: BOOKING_CONFIRM_SCHEDULE_STATUS_KEY,
                metadata: { ...existingScheduleMeta, booking_attempt_id: booking_attempt_id ?? undefined },
            };
            if (schedulePriceCents != null) updatePayload.price_cents = schedulePriceCents;
            if (locationId != null) updatePayload.location_id = locationId;
            if (customerSubscriptionId && !(existingSchedule as { customer_subscription_id?: string | null }).customer_subscription_id) {
                updatePayload.customer_subscription_id = customerSubscriptionId;
                updatePayload.subscription_sequence = 1;
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
                schedule_status_id: BOOKING_CONFIRM_SCHEDULE_STATUS_ID,
                status_key: BOOKING_CONFIRM_SCHEDULE_STATUS_KEY,
                ...(schedulePriceCents != null && { price_cents: schedulePriceCents }),
                ...(locationId != null && { location_id: locationId }),
                metadata: { booking_attempt_id: booking_attempt_id ?? undefined },
            };
            if (customerSubscriptionId) {
                scheduleInsert.customer_subscription_id = customerSubscriptionId;
                scheduleInsert.subscription_sequence = 1;
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
                    primary_contact_id,
                    primary_person_id,
                    opportunity_id,
                    vertical_id,
                    location_id,
                    opportunities!inner(
                        id,
                        customer_id,
                        primary_contact_id,
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

        // Verify linkages (primary_contact_id when contactId set; primary_person_id when person path)
        const integrityIssues: string[] = [];
        if (job?.customer_id !== customerId) {
            integrityIssues.push(`job.customer_id mismatch: expected=${customerId} actual=${job?.customer_id}`);
        }
        if (contactId != null) {
            if (job?.primary_contact_id !== contactId) {
                integrityIssues.push(`job.primary_contact_id mismatch: expected=${contactId} actual=${job?.primary_contact_id}`);
            }
            if (opportunity?.primary_contact_id !== contactId) {
                integrityIssues.push(`opportunity.primary_contact_id mismatch: expected=${contactId} actual=${opportunity?.primary_contact_id}`);
            }
        } else if (personIdFromQuote) {
            if ((job as { primary_person_id?: string | null })?.primary_person_id !== personIdFromQuote) {
                integrityIssues.push(`job.primary_person_id mismatch: expected=${personIdFromQuote} actual=${(job as { primary_person_id?: string | null })?.primary_person_id}`);
            }
            if ((opportunity as { primary_person_id?: string | null })?.primary_person_id !== personIdFromQuote) {
                integrityIssues.push(`opportunity.primary_person_id mismatch: expected=${personIdFromQuote} actual=${(opportunity as { primary_person_id?: string | null })?.primary_person_id}`);
            }
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
                `[BOOK_V2_CONFIRM_INTEGRITY_FAIL] booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} contact_id=${contactId} customer_id=${customerId} issues=${JSON.stringify(integrityIssues)}`
            );
            return NextResponse.json(
                { ok: false, message: `Booking integrity check failed: ${integrityIssues.join("; ")}`, booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        // Log integrity success
        console.log(
            `[BOOK_V2_CONFIRM_INTEGRITY_OK] booking_attempt_id=${booking_attempt_id ?? "None"} schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} contact_id=${contactId} customer_id=${customerId} start_at=${integrityCheck.start_at} end_at=${integrityCheck.end_at} timezone=${integrityCheck.timezone} duration_minutes=${integrityCheck.duration_minutes}`
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
                contactId,
                personIdFromQuote,
                slot_start,
                slot_end,
                timezone,
            })
        );

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total} has_saved_payment_method=${hasSavedPaymentMethod}`
        );
        bookV2PerfLog("confirm_total_to_response", confirmRouteT0, booking_attempt_id ?? null);

        return NextResponse.json({
            ok: true,
            ...(contactId != null && { contact_id: contactId }),
            ...(personIdFromQuote != null && { person_id: personIdFromQuote }),
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
