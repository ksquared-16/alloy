import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolve_or_create_contact_and_customer } from "@/lib/bookingResolver";
import { executeWorkflowRun } from "@/lib/workflowRun";

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
 * - discount_code_id: string | null (optional)
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
            discount_code = null,
            contact_email,
            contact_phone,
            contact_first_name,
            contact_last_name,
            address,
            city,
            bedrooms,
            bathrooms,
            access_method,
            access_note,
            additional_notes,
            frequency_label = "One-time",
            booking_attempt_id = bookingAttemptId,
        } = body;

        const service_frequency_key = normalizeFrequencyKey(frequency_label);
        console.log(
            "[BOOK_V2_CONFIRM_START] booking_attempt_id=%s email=%s phone=%s slot_start=%s slot_end=%s frequency_label=%s service_frequency_key=%s discount_code_id=%s discount_code=%s discount_amount=%s",
            booking_attempt_id ?? "None",
            contact_email ?? "None",
            contact_phone ?? "None",
            slot_start ?? "None",
            slot_end ?? "None",
            frequency_label ?? "None",
            service_frequency_key,
            discount_code_id ?? "None",
            discount_code ?? "None",
            discount_amount
        );

        // Validation
        if (!slot_start || !slot_end || !timezone || !contact_email || !contact_phone) {
            return NextResponse.json(
                { ok: false, message: "Missing required fields", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }
        // discount_code_id is required when booking is discounted
        const hasDiscount = Number(discount_amount) > 0 || (quote_total != null && quote_subtotal != null && Number(quote_total) < Number(quote_subtotal));
        if (hasDiscount && !discount_code_id) {
            return NextResponse.json(
                { ok: false, message: "Discount requires a valid discount code (discount_code_id missing).", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Parse dates
        const slotStartDate = new Date(slot_start);
        const slotEndDate = new Date(slot_end);

        // Format job_date and job_time_window in customer timezone
        const jobDate = slotStartDate.toLocaleDateString("en-US", {
            timeZone: timezone,
        });
        const jobTimeWindow = `${slotStartDate.toLocaleTimeString("en-US", {
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

        // Step 1: Resolve or create contact and customer (guaranteed linking)
        let contactId: string;
        let customerId: string;

        try {
            const resolverResult = await resolve_or_create_contact_and_customer(supabase, {
                first_name: contact_first_name,
                last_name: contact_last_name,
                email: contact_email,
                phone: contact_phone,
                postal_code: undefined, // Not provided in booking flow
                timezone: timezone,
                address: address,
                city: city,
                state: undefined, // Not provided in booking flow
                vertical_key: "cleaning",
            });

            contactId = resolverResult.contact_id;
            customerId = resolverResult.customer_id;

            console.log(
                `[BOOK_V2_CONFIRM] Contact/Customer resolved booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId} resolution_path=${resolverResult.resolution_path} customer_resolution_path=${resolverResult.customer_resolution_path}`
            );
        } catch (error: any) {
            console.error("[BOOK_V2_CONFIRM] Failed to resolve contact/customer booking_attempt_id=", booking_attempt_id, error);
            return NextResponse.json(
                { ok: false, message: `Failed to resolve contact/customer: ${error.message}`, booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        // Step 2: If discount used, check redemption not already recorded (enforce "once per customer")
        if (discount_code_id && customerId) {
            const { data: existingRedemption, error: redemptionCheckError } = await supabase
                .from("discount_redemptions")
                .select("id")
                .eq("discount_code_id", discount_code_id)
                .eq("customer_id", customerId)
                .limit(1)
                .maybeSingle();

            if (redemptionCheckError) {
                console.error("[BOOK_V2_CONFIRM] Error checking discount redemption booking_attempt_id=", booking_attempt_id, redemptionCheckError);
                return NextResponse.json(
                    { ok: false, message: "Failed to check discount usage", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
            if (existingRedemption) {
                console.log("[BOOK_V2_CONFIRM_REDEMPTION_ALREADY_USED] booking_attempt_id=%s customer_id=%s discount_code_id=%s", booking_attempt_id ?? "None", customerId, discount_code_id);
                return NextResponse.json(
                    { ok: false, message: "That promo code has already been used for this customer.", reason: "discount_already_used", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 409 }
                );
            }
        }

        // Step 3: Get vertical_id for "cleaning"
        const { data: vertical, error: verticalError } = await supabase
            .from("verticals")
            .select("id")
            .eq("slug", "cleaning")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

        if (verticalError) {
            console.error("[BOOK_V2_CONFIRM] Error fetching vertical booking_attempt_id=", booking_attempt_id, verticalError);
            return NextResponse.json(
                { ok: false, message: "Failed to fetch service", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        if (!vertical) {
            console.error("[BOOK_V2_CONFIRM] Vertical 'cleaning' not found booking_attempt_id=", booking_attempt_id);
            return NextResponse.json(
                { ok: false, message: "Service not available", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const verticalId = vertical.id;

        // Step 4: Find or create opportunity
        // Reuse only if existing opportunity has same booking_attempt_id (idempotent retry). Otherwise create new.
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existingOppRow, error: oppSearchError } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_contact_id, metadata")
            .eq("primary_contact_id", contactId)
            .eq("status", "open")
            .gte("created_at", tenMinutesAgo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (oppSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for opportunity booking_attempt_id=", booking_attempt_id, oppSearchError);
            return NextResponse.json(
                { ok: false, message: "Failed to search for opportunity", booking_attempt_id: booking_attempt_id ?? null },
                { status: 500 }
            );
        }

        const existingOpp =
            existingOppRow &&
            booking_attempt_id &&
            (existingOppRow.metadata as Record<string, unknown> | null)?.booking_attempt_id === booking_attempt_id
                ? existingOppRow
                : null;

        let opportunityId: string;
        if (existingOpp) {
            opportunityId = existingOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing opportunity booking_attempt_id=${booking_attempt_id ?? "None"} opportunity_id=${opportunityId} (reused)`);

            // Get existing opportunity data to check what needs backfilling
            const { data: existingOppData } = await supabase
                .from("opportunities")
                .select("vertical_id, customer_id, primary_contact_id, monetary_value_cents")
                .eq("id", opportunityId)
                .single();

            // Update opportunity with booking details and backfill links
            const estimatedPriceCents = quote_subtotal ? Math.round(quote_subtotal * 100) : null;
            const existingMeta = ((existingOpp as { metadata?: Record<string, unknown> })?.metadata) || {};
            const updatePayload: Record<string, any> = {
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal || null,
                discount_amount: discount_amount ?? null,
                quote_total: quote_total || null,
                estimated_price_cents: estimatedPriceCents,
                customer_id: customerId,
                primary_contact_id: contactId,
                metadata: { ...existingMeta, booking_attempt_id: booking_attempt_id ?? undefined },
            };
            if (discount_code_id != null) {
                updatePayload.discount_code_id = discount_code_id;
                if (discount_code != null) updatePayload.discount_code = discount_code;
                updatePayload.discount_amount = discount_amount ?? null;
            }

            // Backfill vertical_id if missing
            if (existingOppData && !existingOppData.vertical_id) {
                updatePayload.vertical_id = verticalId;
            }
            
            // Backfill monetary_value_cents if missing
            if (estimatedPriceCents && !existingOppData?.monetary_value_cents) {
                updatePayload.monetary_value_cents = estimatedPriceCents;
                console.log(`[BOOK_V2_CONFIRM] Backfilled opportunity.monetary_value_cents=${estimatedPriceCents} opportunity_id=${opportunityId}`);
            }

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
            // Create new opportunity
            const estimatedPriceCents = quote_subtotal ? Math.round(quote_subtotal * 100) : null;
            const { data: newOpp, error: oppError } = await supabase
                .from("opportunities")
                .insert({
                    vertical_id: verticalId,
                    primary_contact_id: contactId,
                    customer_id: customerId,
                    name: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                    status: "open",
                    source: "website",
                    job_date: jobDate,
                    job_time_window: jobTimeWindow,
                    quote_subtotal: quote_subtotal || null,
                    discount_amount: discount_amount ?? null,
                    quote_total: quote_total || null,
                    estimated_price_cents: estimatedPriceCents,
                    monetary_value_cents: estimatedPriceCents, // Set on create
                    ...(discount_code_id != null && {
                        discount_code_id,
                        discount_code: discount_code ?? null,
                        discount_amount: discount_amount ?? null,
                    }),
                    metadata: {
                        booking_source: "book-v2",
                        booking_attempt_id: booking_attempt_id ?? undefined,
                        timezone,
                        address: address || null,
                        city: city || null,
                        bedrooms: bedrooms || null,
                        bathrooms: bathrooms || null,
                        access_method: access_method || null,
                        access_note: access_note || null,
                        additional_notes: additional_notes || null,
                    },
                })
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

        // Step 5: Create or update job
        // Reuse only if existing job has same booking_attempt_id (idempotent retry). Otherwise create new.
        const { data: existingJobRow, error: jobSearchError } = await supabase
            .from("jobs")
            .select("id, customer_id, primary_contact_id, metadata")
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

            // Get existing job data to check what needs backfilling
            const { data: existingJobData } = await supabase
                .from("jobs")
                .select("vertical_id, estimated_total_cents, gross_price_cents, service_frequency_key")
                .eq("id", jobId)
                .single();

            // Update job and backfill all links and fields; persist metadata for this attempt
            const jobMeta = ((existingJob as { metadata?: Record<string, unknown> })?.metadata) || {};
            const jobUpdatePayload: Record<string, any> = {
                scheduled_at: slot_start,
                customer_id: customerId,
                primary_contact_id: contactId,
                metadata: {
                    ...jobMeta,
                    booking_attempt_id: booking_attempt_id ?? undefined,
                    frequency_label: frequency_label ?? undefined,
                    service_frequency_key: service_frequency_key,
                },
            };
            if (discount_code_id != null) {
                jobUpdatePayload.discounted = true;
                jobUpdatePayload.discount_code_id = discount_code_id;
                jobUpdatePayload.discount_code = discount_code ?? null;
                jobUpdatePayload.discount_amount = discount_amount ?? null;
            }

            // Backfill vertical_id if missing
            if (existingJobData && !existingJobData.vertical_id) {
                jobUpdatePayload.vertical_id = verticalId;
            }

            // Backfill pricing if missing
            if (quoteTotalCents) {
                if (!existingJobData?.estimated_total_cents) {
                    jobUpdatePayload.estimated_total_cents = quoteTotalCents;
                }
                if (!existingJobData?.gross_price_cents) {
                    jobUpdatePayload.gross_price_cents = quoteTotalCents;
                }
            }
            
            // Backfill service_frequency_key if missing
            if (!existingJobData?.service_frequency_key) {
                jobUpdatePayload.service_frequency_key = service_frequency_key;
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
            const jobPayload: Record<string, any> = {
                opportunity_id: opportunityId,
                customer_id: customerId,
                primary_contact_id: contactId,
                vertical_id: verticalId,
                title: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim() || "Cleaning Service",
                description: `Scheduled cleaning service`,
                scheduled_at: slot_start,
                ...(discount_code_id != null && {
                    discounted: true,
                    discount_code_id,
                    discount_code: discount_code ?? null,
                    discount_amount: discount_amount ?? null,
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
                    bedrooms: bedrooms || null,
                    bathrooms: bathrooms || null,
                    access_method: access_method || null,
                    access_note: access_note || null,
                    additional_notes: additional_notes || null,
                },
            };

            // Set pricing fields
            if (quoteTotalCents) {
                jobPayload.estimated_total_cents = quoteTotalCents;
                jobPayload.gross_price_cents = quoteTotalCents;
            }
            
            jobPayload.service_frequency_key = service_frequency_key;

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

        // Step 5b: Persist discount redemption immediately after job creation (unique uniq_redemption_per_customer_code)
        if (discount_code_id) {
            console.log("[BOOK_V2_CONFIRM_REDEMPTION_INSERT_BEFORE] booking_attempt_id=%s discount_code_id=%s customer_id=%s contact_id=%s opportunity_id=%s job_id=%s", booking_attempt_id ?? "None", discount_code_id, customerId, contactId, opportunityId, jobId);
            const { data: redemptionRow, error: redemptionInsertError } = await supabase
                .from("discount_redemptions")
                .insert({
                    discount_code_id,
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
                    console.log("[BOOK_V2_CONFIRM_REDEMPTION_INSERT_CONFLICT] booking_attempt_id=%s customer_id=%s discount_code_id=%s (uniq_redemption_per_customer_code)", booking_attempt_id ?? "None", customerId, discount_code_id);
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
            console.log("[BOOK_V2_CONFIRM_REDEMPTION_INSERT_AFTER] booking_attempt_id=%s redemption_id=%s discount_code_id=%s", booking_attempt_id ?? "None", redemptionRow?.id ?? "?", discount_code_id);
        }

        // Step 6: Create schedule
        // Reuse only if same start_at, end_at, timezone AND metadata.booking_attempt_id === booking_attempt_id. Otherwise create new row.
        const { data: existingSchedules, error: scheduleSearchError } = await supabase
            .from("schedules")
            .select("id, start_at, end_at, timezone, metadata")
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

            // Update schedule (keep metadata.booking_attempt_id)
            const existingScheduleMeta = (existingSchedule.metadata as Record<string, unknown>) || {};
            const { error: scheduleUpdateError } = await supabase
                .from("schedules")
                .update({
                    start_at: slot_start,
                    end_at: slot_end,
                    duration_minutes: 120,
                    timezone,
                    metadata: { ...existingScheduleMeta, booking_attempt_id: booking_attempt_id ?? undefined },
                })
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
            const { data: newSchedule, error: scheduleError } = await supabase
                .from("schedules")
                .insert({
                    job_id: jobId,
                    start_at: slot_start,
                    end_at: slot_end,
                    duration_minutes: 120,
                    timezone,
                    metadata: { booking_attempt_id: booking_attempt_id ?? undefined },
                })
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

        // Step 8: Check if customer has saved payment method
        let hasSavedPaymentMethod = false;
        let paymentMethodBrand: string | null = null;
        let paymentMethodLast4: string | null = null;

        if (customerId) {
            const { data: customer, error: customerFetchError } = await supabase
                .from("customers")
                .select("default_payment_method_id, stripe_customer_id, payment_method_brand, payment_method_last4")
                .eq("id", customerId)
                .maybeSingle();

            if (!customerFetchError && customer) {
                hasSavedPaymentMethod = !!customer.default_payment_method_id;
                paymentMethodBrand = customer.payment_method_brand || null;
                paymentMethodLast4 = customer.payment_method_last4 || null;
            }
        }

        // Step 9: Integrity check - verify all linkages
        const { data: integrityCheck, error: integrityError } = await supabase
            .from("schedules")
            .select(`
                id,
                job_id,
                start_at,
                end_at,
                timezone,
                duration_minutes,
                jobs!inner(
                    id,
                    customer_id,
                    primary_contact_id,
                    opportunity_id,
                    vertical_id,
                    opportunities!inner(
                        id,
                        customer_id,
                        primary_contact_id,
                        vertical_id
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

        // Verify linkages
        const integrityIssues: string[] = [];
        if (job?.customer_id !== customerId) {
            integrityIssues.push(`job.customer_id mismatch: expected=${customerId} actual=${job?.customer_id}`);
        }
        if (job?.primary_contact_id !== contactId) {
            integrityIssues.push(`job.primary_contact_id mismatch: expected=${contactId} actual=${job?.primary_contact_id}`);
        }
        if (job?.opportunity_id !== opportunityId) {
            integrityIssues.push(`job.opportunity_id mismatch: expected=${opportunityId} actual=${job?.opportunity_id}`);
        }
        if (opportunity?.customer_id !== customerId) {
            integrityIssues.push(`opportunity.customer_id mismatch: expected=${customerId} actual=${opportunity?.customer_id}`);
        }
        if (opportunity?.primary_contact_id !== contactId) {
            integrityIssues.push(`opportunity.primary_contact_id mismatch: expected=${contactId} actual=${opportunity?.primary_contact_id}`);
        }
        if (job?.id !== jobId) {
            integrityIssues.push(`schedule.job_id mismatch: expected=${jobId} actual=${job?.id}`);
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

        // Step 10: Auto-run booking_confirmed workflows
        const { data: bookingWorkflows } = await supabase
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "booking_confirmed")
            .eq("entity_type", "job");
        if (bookingWorkflows?.length) {
            const { data: jobRow } = await supabase.from("jobs").select("id, title, scheduled_at, service_frequency_key, opportunity_id, primary_contact_id, customer_id").eq("id", jobId).single();
            const sched = integrityCheck as Record<string, unknown>;
            const { data: oppRow } = await supabase.from("opportunities").select("id, name, job_date, job_time_window, pipeline_stage_id").eq("id", opportunityId).single();
            const { data: contactRow } = await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", contactId).single();
            const { data: customerRow } = await supabase.from("customers").select("id, name").eq("id", customerId).single();
            const eventPayload: Record<string, unknown> = {
                job: jobRow ? { id: jobRow.id, title: jobRow.title, scheduled_at: jobRow.scheduled_at, service_frequency_key: jobRow.service_frequency_key, opportunity_id: jobRow.opportunity_id, primary_contact_id: jobRow.primary_contact_id, customer_id: jobRow.customer_id } : { id: jobId, title: null, scheduled_at: slot_start, service_frequency_key, opportunity_id: opportunityId, primary_contact_id: contactId, customer_id: customerId },
                schedule: { id: scheduleId, start_at: sched.start_at ?? slot_start, end_at: sched.end_at ?? slot_end, timezone: sched.timezone ?? timezone, duration_minutes: sched.duration_minutes ?? 120 },
                contact: contactRow ? { id: contactRow.id, first_name: contactRow.first_name, last_name: contactRow.last_name, email: contactRow.email, phone: contactRow.phone } : { id: contactId, first_name: null, last_name: null, email: null, phone: null },
                customer: customerRow ? { id: customerRow.id, name: customerRow.name } : { id: customerId, name: null },
                opportunity: oppRow ? { id: oppRow.id, name: oppRow.name, job_date: oppRow.job_date, job_time_window: oppRow.job_time_window, pipeline_stage_id: oppRow.pipeline_stage_id ?? null } : { id: opportunityId, name: null, job_date: jobDate, job_time_window: jobTimeWindow, pipeline_stage_id: null },
            };
            for (const wf of bookingWorkflows) {
                try {
                    const runResult = await executeWorkflowRun(supabase, wf.id, eventPayload);
                    console.log(`[BOOK_V2_CONFIRM_WORKFLOW] workflow_id=${wf.id} run_id=${runResult.workflow_run_id} status=${runResult.status}`);
                } catch (wfErr: unknown) {
                    console.error("[BOOK_V2_CONFIRM_WORKFLOW_ERROR]", wf.id, wfErr);
                    // Don't fail the booking; log and continue
                }
            }
        }

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] booking_attempt_id=${booking_attempt_id ?? "None"} contact_id=${contactId} customer_id=${customerId} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total} has_saved_payment_method=${hasSavedPaymentMethod}`
        );

        return NextResponse.json({
            ok: true,
            contact_id: contactId,
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
