import { NextRequest, NextResponse } from "next/server";
import { resolve_or_create_contact_and_customer } from "@/lib/bookingResolver";
import { ensureCustomerAddressLocation } from "@/lib/bookingLocations";
import { emitEvent } from "@/lib/emitEvent";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { executeWorkflowRun } from "@/lib/workflowRun";

type Supabase = ReturnType<typeof createServiceRoleClient>;

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
        .select("id, first_name, last_name, email, phone")
        .eq("id", personId)
        .single();
    if (!person) throw new Error("Person not found");
    const p = person as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };

    // Existing customer via customer_persons?
    const { data: cp } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    if (cp?.customer_id) {
        const customerId = (cp as { customer_id: string }).customer_id;
        const { data: cust } = await supabase.from("customers").select("primary_contact_id").eq("id", customerId).single();
        const primaryContactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
        return { customerId, contactId: primaryContactId };
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
        const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert(contactInsert)
            .select("id")
            .single();
        if (!contactErr && newContact) {
            contactId = (newContact as { id: string }).id;
        }
    }

    const payload: Record<string, unknown> = {
        name,
        status: "active",
        vertical_id: params.vertical_id,
        metadata: { source: "book-v2-confirm", email: params.email ?? p.email ?? undefined, phone: params.phone ?? p.phone ?? undefined },
    };
    if (params.org_id) payload.org_id = params.org_id;
    if (contactId) payload.primary_contact_id = contactId;

    const { data: newCustomer, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505" && contactId) {
            const { data: existing } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
            if (existing?.id) {
                await supabase.from("contacts").update({ customer_id: existing.id }).eq("id", contactId);
                const { data: existingCp } = await supabase.from("customer_persons").select("id").eq("customer_id", existing.id).eq("person_id", personId).maybeSingle();
                if (!existingCp) {
                    await supabase.from("customer_persons").insert({
                        customer_id: existing.id,
                        person_id: personId,
                        org_id: params.org_id,
                    });
                }
                return { customerId: (existing as { id: string }).id, contactId };
            }
        }
        throw new Error(insErr?.message ?? "Failed to create customer");
    }
    const customerId = (newCustomer as { id: string }).id;
    if (contactId) {
        await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
    }
    await supabase.from("customer_persons").insert({
        customer_id: customerId,
        person_id: personId,
        org_id: params.org_id,
    });
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

    const { data: newCustomer, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505") {
            const { data: existing } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
            if (existing?.id) {
                await supabase.from("contacts").update({ customer_id: existing.id }).eq("id", contactId);
                return existing.id;
            }
        }
        throw new Error(insErr?.message ?? "Failed to create customer");
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
            await supabase.from("customer_persons").insert({
                customer_id: customerId,
                person_id: c.person_id,
                org_id: params.org_id,
            });
        }
    }
    return customerId;
}

/** Get or create pipeline stage by name (for Booked). */
async function getOrCreateBookedStage(
    supabase: ReturnType<typeof createServiceRoleClient>,
    pipelineId: string
): Promise<string | null> {
    const { data: existing } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", pipelineId)
        .ilike("name", "Booked")
        .limit(1)
        .maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created, error } = await supabase
        .from("pipeline_stages")
        .insert({
            pipeline_id: pipelineId,
            name: "Booked",
            position: 100,
            show_in_funnel: true,
            show_in_pie_chart: true,
        })
        .select("id")
        .single();
    if (error || !created) return null;
    return created.id;
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
 * - first_clean_price: number (optional; used for jobs.estimated_total_cents when provided)
 * - recurring_price: number (optional; used for jobs.recurring_total_cents when recurring)
 * - quote_input: object (optional; persisted to opportunity.metadata.quote_input)
 * - quote_output: object (optional; persisted to opportunity.metadata.quote_output)
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
        } = body;

        const service_frequency_key = normalizeFrequencyKey(frequency_label);
        const is_recurring = service_frequency_key !== "one_time";
        const firstCleanCents = typeof first_clean_price === "number" && first_clean_price > 0
            ? Math.round(first_clean_price * 100)
            : null;
        const recurringCents = is_recurring && typeof recurring_price === "number" && recurring_price > 0
            ? Math.round(recurring_price * 100)
            : null;
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
        // discount_code_id is required when booking is discounted
        const hasDiscount = Number(discount_amount) > 0 || (quote_total != null && quote_subtotal != null && Number(quote_total) < Number(quote_subtotal));
        if (hasDiscount && !discount_code_id) {
            return NextResponse.json(
                { ok: false, message: "Discount requires a valid discount code (discount_code_id missing).", booking_attempt_id: booking_attempt_id ?? null },
                { status: 400 }
            );
        }

        const supabase = createServiceRoleClient();

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
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForPersonInConfirm failed", err);
                        return NextResponse.json(
                            { ok: false, message: "Could not create customer for booking.", booking_attempt_id: booking_attempt_id ?? null },
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
                        customerId = await ensureCustomerForContactInConfirm(supabase, contactId, {
                            vertical_id: verticalId,
                            org_id: oppOrgId,
                            first_name: contact_first_name ?? undefined,
                            last_name: contact_last_name ?? undefined,
                            email: contact_email ?? undefined,
                            phone: contact_phone ?? undefined,
                        });
                        await supabase.from("opportunities").update({ customer_id: customerId }).eq("id", opportunityId);
                    } catch (err) {
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForContactInConfirm failed", err);
                        return NextResponse.json(
                            { ok: false, message: "Could not create customer for booking.", booking_attempt_id: booking_attempt_id ?? null },
                            { status: 500 }
                        );
                    }
                }
            }

            // Person path: ensure we have a compatibility contact for downstream (discount_redemptions, job.primary_contact_id, etc.)
            if (personIdFromQuote && !contactId) {
                const { data: person } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", personIdFromQuote).single();
                if (person) {
                    const p = person as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };
                    const contactInsert: Record<string, unknown> = {
                        first_name: contact_first_name ?? p.first_name,
                        last_name: contact_last_name ?? p.last_name,
                        email: contact_email ?? p.email ?? null,
                        phone: contact_phone ?? p.phone ?? null,
                        person_id: personIdFromQuote,
                        contact_type: "lead",
                    };
                    const oppOrgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
                    if (oppOrgId) contactInsert.org_id = oppOrgId;
                    const { data: newContact, error: contactErr } = await supabase.from("contacts").insert(contactInsert).select("id").single();
                    if (!contactErr && newContact) {
                        contactId = (newContact as { id: string }).id;
                        await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
                        await supabase.from("customers").update({ primary_contact_id: contactId }).eq("id", customerId);
                        await supabase.from("opportunities").update({ primary_contact_id: contactId }).eq("id", opportunityId);
                    }
                }
            }

            // Backfill customer.vertical_id when reusing quote (customer may have been created before we set vertical_id)
            const { data: custRow } = await supabase.from("customers").select("vertical_id").eq("id", customerId).single();
            if (custRow && custRow.vertical_id == null) {
                await supabase.from("customers").update({ vertical_id: verticalId }).eq("id", customerId);
            }

            // Discount check (Step 2)
            if (discount_code_id && customerId) {
                const { data: existingRedemption, error: redemptionCheckError } = await supabase
                    .from("discount_redemptions")
                    .select("id")
                    .eq("discount_code_id", discount_code_id)
                    .eq("customer_id", customerId)
                    .limit(1)
                    .maybeSingle();
                if (redemptionCheckError) {
                    return NextResponse.json(
                        { ok: false, message: "Failed to check discount usage", booking_attempt_id: booking_attempt_id ?? null },
                        { status: 500 }
                    );
                }
                if (existingRedemption) {
                    return NextResponse.json(
                        { ok: false, message: "That promo code has already been used for this customer.", reason: "discount_already_used", booking_attempt_id: booking_attempt_id ?? null },
                        { status: 409 }
                    );
                }
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

            const { data: pipelines } = await supabase.from("pipelines").select("id").order("name", { ascending: true }).limit(1);
            const pipelineId = pipelines?.[0]?.id ?? null;
            let bookedStageId: string | null = null;
            if (pipelineId) bookedStageId = await getOrCreateBookedStage(supabase, pipelineId);

            const existingMeta = await (async () => {
                const { data: opp } = await supabase.from("opportunities").select("metadata").eq("id", opportunityId).single();
                return ((opp?.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>;
            })();
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
            };
            if (recurringCents != null) (oppUpdate as Record<string, unknown>).recurring_price_cents = recurringCents;
            if (discount_code_id != null) {
                (oppUpdate as Record<string, unknown>).discount_code_id = discount_code_id;
                (oppUpdate as Record<string, unknown>).discount_code = discount_code ?? null;
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
                        customerId = await ensureCustomerForContactInConfirm(supabase, contactId, {
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
                        console.error("[BOOK_V2_CONFIRM] ensureCustomerForContactInConfirm failed (else branch)", err);
                        return NextResponse.json(
                            { ok: false, message: "Could not create customer for booking.", booking_attempt_id: booking_attempt_id ?? null },
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

        const { data: pipelinesForBooked } = await supabase.from("pipelines").select("id").order("name", { ascending: true }).limit(1);
        const pipelineIdForBooked = pipelinesForBooked?.[0]?.id ?? null;
        let bookedStageIdElse: string | null = null;
        if (pipelineIdForBooked) bookedStageIdElse = await getOrCreateBookedStage(supabase, pipelineIdForBooked);

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
            };
            if (recurringCents != null) updatePayload.recurring_price_cents = recurringCents;
            if (discount_code_id != null) {
                updatePayload.discount_code_id = discount_code_id;
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
                job_date: jobDate,
                job_time_window: jobTimeWindow,
                quote_subtotal: quote_subtotal ?? null,
                discount_amount: discount_amount ?? null,
                quote_total: quote_total ?? null,
                estimated_price_cents: estimatedPriceCentsNew,
                monetary_value_cents: estimatedPriceCentsNew ?? undefined,
                ...(recurringCents != null && { recurring_price_cents: recurringCents }),
                ...(discount_code_id != null && {
                    discount_code_id,
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

        // Step 4b: Ensure customer address location for job/schedule linkage
        const orgIdForLocation = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const { data: oppForLocation } = await supabase.from("opportunities").select("metadata").eq("id", opportunityId).maybeSingle();
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
        try {
            locationId = await ensureCustomerAddressLocation(supabase, {
                org_id: orgIdForLocation,
                customer_id: customerId,
                address_line1: address ?? null,
                city: city ?? null,
                state: locationState,
                postal_code: locationPostalCode,
            });
        } catch (locErr) {
            console.warn("[BOOK_V2_CONFIRM] ensureCustomerAddressLocation failed", locErr);
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
                ...(personIdFromQuote && { primary_person_id: personIdFromQuote }),
                ...(contactId != null && { primary_contact_id: contactId }),
                is_recurring: is_recurring,
                service_key: "cleaning",
                service_frequency_key: service_frequency_key,
                ...(locationId != null && { location_id: locationId }),
                metadata: {
                    ...jobMeta,
                    booking_attempt_id: booking_attempt_id ?? undefined,
                    frequency_label: frequency_label ?? undefined,
                    service_frequency_key: service_frequency_key,
                    home_type: home_type ?? null,
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

        // Step 5b: Persist discount redemption immediately after job creation (unique uniq_redemption_per_customer_code)
        if (discount_code_id) {
            if (contactId == null) {
                console.error("[BOOK_V2_CONFIRM] discount_code_id provided but contactId is null (discount_redemptions.contact_id required)");
                return NextResponse.json(
                    { ok: false, message: "Unable to record discount redemption.", booking_attempt_id: booking_attempt_id ?? null },
                    { status: 500 }
                );
            }
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
                metadata: { ...existingScheduleMeta, booking_attempt_id: booking_attempt_id ?? undefined },
            };
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
                    primary_person_id,
                    opportunity_id,
                    vertical_id,
                    opportunities!inner(
                        id,
                        customer_id,
                        primary_contact_id,
                        primary_person_id,
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

        // Step 10: Auto-run booking_confirmed workflows (opportunity stage, job status, assignment created by workflows)
        const orgIdForWorkflows = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        let workflowQuery = supabase
            .from("workflows")
            .select("id")
            .eq("enabled", true)
            .eq("event_type", "booking_confirmed")
            .eq("entity_type", "job");
        if (orgIdForWorkflows) {
            workflowQuery = workflowQuery.or(`org_id.eq.${orgIdForWorkflows},org_id.is.null`);
        }
        const { data: bookingWorkflows } = await workflowQuery;
        if (bookingWorkflows?.length) {
            const { data: pipelines } = await supabase.from("pipelines").select("id").order("name", { ascending: true }).limit(1);
            const pipelineIdForBooked = pipelines?.[0]?.id ?? null;
            let bookedStageIdForPayload: string | null = null;
            if (pipelineIdForBooked) bookedStageIdForPayload = await getOrCreateBookedStage(supabase, pipelineIdForBooked);

            const { data: jobRow } = await supabase.from("jobs").select("*").eq("id", jobId).single();
            const { data: oppRow } = await supabase.from("opportunities").select("*").eq("id", opportunityId).single();
            let contactRow: Record<string, unknown> | null = null;
            if (contactId) {
                const { data: c } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
                contactRow = c as Record<string, unknown> | null;
            }
            let personRow: Record<string, unknown> | null = null;
            if (personIdFromQuote) {
                const { data: p } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", personIdFromQuote).maybeSingle();
                personRow = p as Record<string, unknown> | null;
            } else if (contactRow && (contactRow as { person_id?: string | null }).person_id) {
                const { data: p } = await supabase.from("persons").select("id, first_name, last_name, email, phone").eq("id", (contactRow as { person_id: string }).person_id).maybeSingle();
                personRow = p as Record<string, unknown> | null;
            }
            const { data: customerRow } = await supabase.from("customers").select("*").eq("id", customerId).single();
            const { data: scheduleRow } = await supabase.from("schedules").select("*").eq("id", scheduleId).single();
            const normalizedSchedule =
                scheduleRow ?? {
                    id: scheduleId,
                    start_at: slot_start,
                    end_at: slot_end,
                    timezone,
                    duration_minutes: 120,
                    created_at: new Date().toISOString(),
                };
            const eventPayload: Record<string, unknown> = {
                event_type: "booking_confirmed",
                occurred_at: new Date().toISOString(),
                org_id: orgIdForWorkflows,
                booked_stage_id: bookedStageIdForPayload,
                job: jobRow ?? null,
                contact: contactRow ?? null,
                person: personRow ?? null,
                customer: customerRow ?? null,
                opportunity: oppRow ?? null,
                schedule: normalizedSchedule,
            };
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
            for (const wf of bookingWorkflows) {
                try {
                    const runResult = await executeWorkflowRun(supabase, wf.id, eventPayload, {
                        event_id: eventId ?? null,
                        org_id: orgIdForWorkflows,
                    });
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
