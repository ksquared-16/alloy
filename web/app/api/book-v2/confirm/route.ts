import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST /api/book-v2/confirm
 * 
 * Creates/updates Opportunity, Job, and Schedule records in Supabase.
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

        // Step 1: Find or create contact
        let contactId: string;
        const { data: existingContact } = await supabase
            .from("contacts")
            .select("id")
            .or(`email.eq.${contact_email},phone.eq.${contact_phone}`)
            .limit(1)
            .single();

        if (existingContact) {
            contactId = existingContact.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing contact: ${contactId}`);
        } else {
            const { data: newContact, error: contactError } = await supabase
                .from("contacts")
                .insert({
                    email: contact_email.toLowerCase().trim(),
                    phone: contact_phone.trim(),
                    first_name: contact_first_name || null,
                    last_name: contact_last_name || null,
                    contact_type: "lead",
                })
                .select("id")
                .single();

            if (contactError || !newContact) {
                console.error("[BOOK_V2_CONFIRM] Failed to create contact:", contactError);
                return NextResponse.json(
                    { error: "Failed to create contact" },
                    { status: 500 }
                );
            }

            contactId = newContact.id;
            console.log(`[BOOK_V2_CONFIRM] Created new contact: ${contactId}`);
        }

        // Step 2: Find or create customer (if contact has customer_id, use it)
        const { data: contactWithCustomer } = await supabase
            .from("contacts")
            .select("customer_id")
            .eq("id", contactId)
            .single();

        let customerId: string | null = contactWithCustomer?.customer_id || null;

        // Step 3: Get vertical_id for "cleaning"
        const { data: vertical } = await supabase
            .from("verticals")
            .select("id")
            .eq("slug", "cleaning")
            .eq("is_active", true)
            .limit(1)
            .single();

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
        const { data: existingOpp } = await supabase
            .from("opportunities")
            .select("id")
            .eq("primary_contact_id", contactId)
            .eq("status", "open")
            .gte("created_at", tenMinutesAgo)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        let opportunityId: string;
        if (existingOpp) {
            opportunityId = existingOpp.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing opportunity: ${opportunityId}`);

            // Update opportunity with booking details
            const estimatedPriceCents = quote_subtotal ? Math.round(quote_subtotal * 100) : null;
            const { error: oppUpdateError } = await supabase
                .from("opportunities")
                .update({
                    job_date: jobDate,
                    job_time_window: jobTimeWindow,
                    quote_subtotal: quote_subtotal || null,
                    discount_amount: discount_amount || null,
                    quote_total: quote_total || null,
                    estimated_price_cents: estimatedPriceCents,
                    customer_id: customerId,
                })
                .eq("id", opportunityId);

            if (oppUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update opportunity:", oppUpdateError);
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
                    name: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim(),
                    status: "open",
                    source: "website",
                    job_date: jobDate,
                    job_time_window: jobTimeWindow,
                    quote_subtotal: quote_subtotal || null,
                    discount_amount: discount_amount || null,
                    quote_total: quote_total || null,
                    estimated_price_cents: estimatedPriceCents,
                    metadata: {
                        booking_source: "book-v2",
                        timezone,
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
        const { data: existingJob } = await supabase
            .from("jobs")
            .select("id")
            .eq("opportunity_id", opportunityId)
            .limit(1)
            .single();

        let jobId: string;
        if (existingJob) {
            jobId = existingJob.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing job: ${jobId}`);

            // Update job
            const { error: jobUpdateError } = await supabase
                .from("jobs")
                .update({
                    scheduled_at: slot_start,
                    customer_id: customerId,
                    primary_contact_id: contactId,
                })
                .eq("id", jobId);

            if (jobUpdateError) {
                console.error("[BOOK_V2_CONFIRM] Failed to update job:", jobUpdateError);
            }
        } else {
            // Create new job
            const { data: newJob, error: jobError } = await supabase
                .from("jobs")
                .insert({
                    opportunity_id: opportunityId,
                    customer_id: customerId,
                    primary_contact_id: contactId,
                    title: `${contact_first_name || ""} ${contact_last_name || ""} — Cleaning`.trim(),
                    description: `Scheduled cleaning service`,
                    scheduled_at: slot_start,
                    metadata: {
                        booking_source: "book-v2",
                        timezone,
                        quote_subtotal,
                        discount_amount,
                        quote_total,
                    },
                })
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
        const { data: existingSchedule } = await supabase
            .from("schedules")
            .select("id")
            .eq("job_id", jobId)
            .limit(1)
            .single();

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
            const { data: redemption } = await supabase
                .from("discount_redemptions")
                .select("id")
                .eq("discount_code_id", discount_code_id)
                .eq("contact_id", contactId)
                .limit(1)
                .single();

            if (redemption) {
                // Update redemption with opportunity_id and job_id
                await supabase
                    .from("discount_redemptions")
                    .update({
                        opportunity_id: opportunityId,
                        job_id: jobId,
                    })
                    .eq("id", redemption.id);
            }
        }

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] contact_id=${contactId} customer_id=${customerId || "null"} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total}`
        );

        return NextResponse.json({
            ok: true,
            schedule_id: scheduleId,
            job_id: jobId,
            opportunity_id: opportunityId,
            contact_id: contactId,
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

