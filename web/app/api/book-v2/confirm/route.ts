import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolve_or_create_contact_and_customer } from "@/lib/bookingResolver";

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
    try {
        const body = await request.json();
        const {
            slot_start,
            slot_end,
            timezone,
            quote_subtotal,
            discount_amount = 0,
            quote_total,
            discount_code_id = null,
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
        } = body;

        // Validation
        if (!slot_start || !slot_end || !timezone || !contact_email || !contact_phone) {
            return NextResponse.json(
                { error: "Missing required fields" },
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
                `[BOOK_V2_CONFIRM] Contact/Customer resolved: contact_id=${contactId} customer_id=${customerId} resolution_path=${resolverResult.resolution_path} customer_resolution_path=${resolverResult.customer_resolution_path}`
            );
        } catch (error: any) {
            console.error("[BOOK_V2_CONFIRM] Failed to resolve contact/customer:", error);
            return NextResponse.json(
                { error: `Failed to resolve contact/customer: ${error.message}` },
                { status: 500 }
            );
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
            console.error("[BOOK_V2_CONFIRM] Error fetching vertical:", verticalError);
            return NextResponse.json(
                { error: "Failed to fetch service" },
                { status: 500 }
            );
        }

        if (!vertical) {
            console.error("[BOOK_V2_CONFIRM] Vertical 'cleaning' not found");
            return NextResponse.json(
                { error: "Service not available" },
                { status: 500 }
            );
        }

        const verticalId = vertical.id;

        // Step 4: Find or create opportunity
        // Check for existing opportunity for this contact (recent, open status)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existingOpp, error: oppSearchError } = await supabase
            .from("opportunities")
            .select("id, customer_id, primary_contact_id")
            .eq("primary_contact_id", contactId)
            .eq("status", "open")
            .gte("created_at", tenMinutesAgo)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (oppSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for opportunity:", oppSearchError);
            return NextResponse.json(
                { error: "Failed to search for opportunity" },
                { status: 500 }
            );
        }

        let opportunityId: string;
        if (existingOpp) {
            opportunityId = existingOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing opportunity: ${opportunityId} (reused)`);

            // Get existing opportunity data to check what needs backfilling
            const { data: existingOppData } = await supabase
                .from("opportunities")
                .select("vertical_id, customer_id, primary_contact_id, monetary_value_cents")
                .eq("id", opportunityId)
                .single();

            // Update opportunity with booking details and backfill links
            const estimatedPriceCents = quote_subtotal ? Math.round(quote_subtotal * 100) : null;
            const updatePayload: Record<string, any> = {
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal || null,
                discount_amount: discount_amount || null,
                quote_total: quote_total || null,
                estimated_price_cents: estimatedPriceCents,
                customer_id: customerId,
                primary_contact_id: contactId,
            };

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
                console.error("[BOOK_V2_CONFIRM] Failed to update opportunity:", oppUpdateError);
                return NextResponse.json(
                    { error: "Failed to update opportunity" },
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
                    discount_amount: discount_amount || null,
                    quote_total: quote_total || null,
                    estimated_price_cents: estimatedPriceCents,
                    monetary_value_cents: estimatedPriceCents, // Set on create
                    metadata: {
                        booking_source: "book-v2",
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
                console.error("[BOOK_V2_CONFIRM] Failed to create opportunity:", oppError);
                return NextResponse.json(
                    { error: "Failed to create opportunity" },
                    { status: 500 }
                );
            }

            opportunityId = newOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Created new opportunity: ${opportunityId}`);
        }

        // Step 5: Create or update job
        // Check for existing job for this opportunity
        const { data: existingJob, error: jobSearchError } = await supabase
            .from("jobs")
            .select("id, customer_id, primary_contact_id")
            .eq("opportunity_id", opportunityId)
            .limit(1)
            .maybeSingle();

        if (jobSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for job:", jobSearchError);
            return NextResponse.json(
                { error: "Failed to search for job" },
                { status: 500 }
            );
        }

        let jobId: string;
        const quoteTotalCents = quote_total ? Math.round(quote_total * 100) : null;

        if (existingJob) {
            jobId = existingJob.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing job: ${jobId} (reused)`);

            // Get existing job data to check what needs backfilling
            const { data: existingJobData } = await supabase
                .from("jobs")
                .select("vertical_id, estimated_total_cents, gross_price_cents, service_frequency_key")
                .eq("id", jobId)
                .single();

            // Update job and backfill all links and fields
            const jobUpdatePayload: Record<string, any> = {
                scheduled_at: slot_start,
                customer_id: customerId,
                primary_contact_id: contactId,
            };

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
                const frequencyKey = normalizeFrequencyKey(frequency_label);
                jobUpdatePayload.service_frequency_key = frequencyKey;
                console.log(`[BOOK_V2_CONFIRM] Backfilled job.service_frequency_key=${frequencyKey} job_id=${jobId}`);
            }

            const { error: jobUpdateError } = await supabase
                .from("jobs")
                .update(jobUpdatePayload)
                .eq("id", jobId);

            if (jobUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update job:", jobUpdateError);
                return NextResponse.json(
                    { error: "Failed to update job" },
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
                metadata: {
                    booking_source: "book-v2",
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
            
            // Set service_frequency_key
            const frequencyKey = normalizeFrequencyKey(frequency_label);
            jobPayload.service_frequency_key = frequencyKey;

            const { data: newJob, error: jobError } = await supabase
                .from("jobs")
                .insert(jobPayload)
                .select("id")
                .single();

            if (jobError || !newJob) {
                console.error("[BOOK_V2_CONFIRM] Failed to create job:", jobError);
                return NextResponse.json(
                    { error: "Failed to create job" },
                    { status: 500 }
                );
            }

            jobId = newJob.id;
            console.log(`[BOOK_V2_CONFIRM] Created new job: ${jobId}`);
        }

        // Guard: Ensure job_id exists
        if (!jobId) {
            console.error("[BOOK_V2_CONFIRM] job_id missing, aborting");
            return NextResponse.json(
                { error: "Job creation failed" },
                { status: 500 }
            );
        }

        // Step 6: Create schedule
        // Check for existing schedule for this job (idempotency)
        const { data: existingSchedule, error: scheduleSearchError } = await supabase
            .from("schedules")
            .select("id")
            .eq("job_id", jobId)
            .limit(1)
            .maybeSingle();

        if (scheduleSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for schedule:", scheduleSearchError);
            return NextResponse.json(
                { error: "Failed to search for schedule" },
                { status: 500 }
            );
        }

        let scheduleId: string;
        if (existingSchedule) {
            scheduleId = existingSchedule.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing schedule: ${scheduleId}`);

            // Update schedule
            const { error: scheduleUpdateError } = await supabase
                .from("schedules")
                .update({
                    start_at: slot_start,
                    end_at: slot_end,
                    duration_minutes: 120,
                    timezone,
                })
                .eq("id", scheduleId);

            if (scheduleUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update schedule:", scheduleUpdateError);
                return NextResponse.json(
                    { error: "Failed to update schedule" },
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
                })
                .select("id")
                .single();

            if (scheduleError) {
                // Check if it's a conflict error
                if (scheduleError.code === "23505" || scheduleError.message?.includes("conflict")) {
                    console.error("[BOOK_V2_CONFIRM] Schedule conflict detected:", scheduleError);
                    return NextResponse.json(
                        { error: "This time slot is no longer available. Please select another time." },
                        { status: 409 }
                    );
                }

                console.error("[BOOK_V2_CONFIRM] Failed to create schedule:", scheduleError);
                return NextResponse.json(
                    { error: "Failed to create schedule" },
                    { status: 500 }
                );
            }

            if (!newSchedule) {
                console.error("[BOOK_V2_CONFIRM] Schedule creation returned no data");
                return NextResponse.json(
                    { error: "Failed to create schedule" },
                    { status: 500 }
                );
            }

            scheduleId = newSchedule.id;
            console.log(`[BOOK_V2_CONFIRM] Created new schedule: ${scheduleId}`);
        }

        // Step 7: Update discount redemption if discount_code_id provided
        if (discount_code_id) {
            // Find redemption by discount_code_id and contact_id
            const { data: redemption, error: redemptionSearchError } = await supabase
                .from("discount_redemptions")
                .select("id")
                .eq("discount_code_id", discount_code_id)
                .eq("contact_id", contactId)
                .limit(1)
                .maybeSingle();

            if (redemptionSearchError) {
                console.error("[BOOK_V2_CONFIRM] Error searching for discount redemption:", redemptionSearchError);
                // Non-fatal, continue
            } else if (redemption) {
                // Update redemption with opportunity_id and job_id
                const { error: redemptionUpdateError } = await supabase
                    .from("discount_redemptions")
                    .update({
                        opportunity_id: opportunityId,
                        job_id: jobId,
                    })
                    .eq("id", redemption.id);

                if (redemptionUpdateError) {
                    console.error("[BOOK_V2_CONFIRM] Failed to update discount redemption:", redemptionUpdateError);
                    // Non-fatal, continue
                }
            }
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
                `[BOOK_V2_CONFIRM_INTEGRITY_FAIL] schedule_id=${scheduleId} error=${integrityError?.message || "not found"}`
            );
            return NextResponse.json(
                { error: "Booking integrity check failed" },
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
                `[BOOK_V2_CONFIRM_INTEGRITY_FAIL] schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} contact_id=${contactId} customer_id=${customerId} issues=${JSON.stringify(integrityIssues)}`
            );
            return NextResponse.json(
                { error: `Booking integrity check failed: ${integrityIssues.join("; ")}` },
                { status: 500 }
            );
        }

        // Log integrity success
        console.log(
            `[BOOK_V2_CONFIRM_INTEGRITY_OK] schedule_id=${scheduleId} job_id=${jobId} opportunity_id=${opportunityId} contact_id=${contactId} customer_id=${customerId} start_at=${integrityCheck.start_at} end_at=${integrityCheck.end_at} timezone=${integrityCheck.timezone} duration_minutes=${integrityCheck.duration_minutes}`
        );

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] contact_id=${contactId} customer_id=${customerId} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total} has_saved_payment_method=${hasSavedPaymentMethod}`
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
        });
    } catch (error: any) {
        console.error("[BOOK_V2_CONFIRM_ERROR]", error);
        return NextResponse.json(
            {
                ok: false,
                error: error.message || "Failed to confirm booking",
            },
            { status: 500 }
        );
    }
}
