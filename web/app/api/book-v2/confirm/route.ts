import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Normalize email: trim + lowercase
 */
function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

/**
 * Normalize phone: strip non-digits, preserve leading +, convert to E.164 when possible
 */
function normalizePhone(phone: string): string {
    const trimmed = phone.trim();
    const digits = trimmed.replace(/\D/g, "");
    
    if (!digits) {
        return trimmed; // Return original if no digits
    }
    
    // If already starts with +, preserve it
    if (trimmed.startsWith("+")) {
        return "+" + digits;
    }
    
    // If 10 digits, assume US and prefix +1
    if (digits.length === 10) {
        return "+1" + digits;
    }
    
    // Otherwise, prefix with +
    return "+" + digits;
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
        } = body;

        // Validation
        if (!slot_start || !slot_end || !timezone || !contact_email || !contact_phone) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Normalize email and phone
        const normalizedEmail = normalizeEmail(contact_email);
        const normalizedPhone = normalizePhone(contact_phone);

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

        // Step 1: Find or create contact (with deduplication)
        let contactId: string;
        const { data: existingContact, error: contactSearchError } = await supabase
            .from("contacts")
            .select("id, first_name, last_name, customer_id, email, phone")
            .or(`email.ilike.${normalizedEmail},phone.eq.${normalizedPhone}`)
            .limit(1)
            .maybeSingle();

        if (contactSearchError) {
            console.error("[BOOK_V2_CONFIRM] Error searching for contact:", contactSearchError);
            return NextResponse.json(
                { error: "Failed to search for contact" },
                { status: 500 }
            );
        }

        if (existingContact) {
            contactId = existingContact.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing contact: ${contactId}`);

            // Update contact with any new information
            const updatePayload: Record<string, any> = {};
            if (contact_first_name && !existingContact.first_name) {
                updatePayload.first_name = contact_first_name;
            }
            if (contact_last_name && !existingContact.last_name) {
                updatePayload.last_name = contact_last_name;
            }
            // Ensure normalized email/phone are stored
            if (normalizedEmail !== existingContact.email) {
                updatePayload.email = normalizedEmail;
            }
            if (normalizedPhone !== existingContact.phone) {
                updatePayload.phone = normalizedPhone;
            }

            if (Object.keys(updatePayload).length > 0) {
                const { error: updateError } = await supabase
                    .from("contacts")
                    .update(updatePayload)
                    .eq("id", contactId);

                if (updateError) {
                    console.error("[BOOK_V2_CONFIRM] Failed to update contact:", updateError);
                    return NextResponse.json(
                        { error: "Failed to update contact" },
                        { status: 500 }
                    );
                }
            }
        } else {
            const { data: newContact, error: contactError } = await supabase
                .from("contacts")
                .insert({
                    email: normalizedEmail,
                    phone: normalizedPhone,
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

        // Step 2: Ensure customer exists and is linked
        let customerId: string | null = null;

        // Get contact with customer_id
        const { data: contactWithCustomer, error: contactFetchError } = await supabase
            .from("contacts")
            .select("customer_id")
            .eq("id", contactId)
            .single();

        if (contactFetchError) {
            console.error("[BOOK_V2_CONFIRM] Failed to fetch contact:", contactFetchError);
            return NextResponse.json(
                { error: "Failed to fetch contact" },
                { status: 500 }
            );
        }

        customerId = contactWithCustomer?.customer_id || null;

        // If no customer_id, create customer
        if (!customerId) {
            // Determine customer name with safe fallback
            let customerName: string;
            if (contact_first_name && contact_last_name) {
                customerName = `${contact_first_name} ${contact_last_name}`.trim();
            } else if (contact_first_name) {
                customerName = contact_first_name;
            } else if (normalizedEmail) {
                customerName = normalizedEmail;
            } else if (normalizedPhone) {
                customerName = normalizedPhone;
            } else {
                customerName = "New Customer";
            }

            const { data: newCustomer, error: customerError } = await supabase
                .from("customers")
                .insert({
                    name: customerName,
                    email: normalizedEmail || null,
                    phone: normalizedPhone || null,
                })
                .select("id")
                .single();

            if (customerError || !newCustomer) {
                console.error("[BOOK_V2_CONFIRM] Failed to create customer:", customerError);
                return NextResponse.json(
                    { error: "Failed to create customer" },
                    { status: 500 }
                );
            }

            customerId = newCustomer.id;
            console.log(`[BOOK_V2_CONFIRM] Created new customer: ${customerId}`);

            // Link contact to customer
            const { error: linkError } = await supabase
                .from("contacts")
                .update({ customer_id: customerId })
                .eq("id", contactId);

            if (linkError) {
                console.error("[BOOK_V2_CONFIRM] Failed to link contact to customer:", linkError);
                return NextResponse.json(
                    { error: "Failed to link contact to customer" },
                    { status: 500 }
                );
            }
        } else {
            console.log(`[BOOK_V2_CONFIRM] Using existing customer: ${customerId}`);
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
            console.log(`[BOOK_V2_CONFIRM] Found existing opportunity: ${opportunityId}`);

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
        if (existingJob) {
            jobId = existingJob.id;
            console.log(`[BOOK_V2_CONFIRM] Found existing job: ${jobId}`);

            // Update job and backfill links
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
                return NextResponse.json(
                    { error: "Failed to update job" },
                    { status: 500 }
                );
            }
        } else {
            // Create new job
            const { data: newJob, error: jobError } = await supabase
                .from("jobs")
                .insert({
                    opportunity_id: opportunityId,
                    customer_id: customerId,
                    primary_contact_id: contactId,
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
        if (customerId) {
            const { data: customer, error: customerFetchError } = await supabase
                .from("customers")
                .select("default_payment_method_id, stripe_customer_id")
                .eq("id", customerId)
                .maybeSingle();

            if (!customerFetchError && customer) {
                hasSavedPaymentMethod = !!customer.default_payment_method_id;
            }
        }

        // Structured logging
        console.log(
            `[BOOK_V2_CONFIRM_SUCCESS] contact_id=${contactId} customer_id=${customerId || "null"} opportunity_id=${opportunityId} job_id=${jobId} schedule_id=${scheduleId} slot_start=${slot_start} slot_end=${slot_end} timezone=${timezone} job_date=${jobDate} job_time_window=${jobTimeWindow} quote_subtotal=${quote_subtotal} discount_amount=${discount_amount} quote_total=${quote_total} has_saved_payment_method=${hasSavedPaymentMethod}`
        );

        return NextResponse.json({
            ok: true,
            contact_id: contactId,
            customer_id: customerId,
            opportunity_id: opportunityId,
            job_id: jobId,
            schedule_id: scheduleId,
            has_saved_payment_method: hasSavedPaymentMethod,
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
