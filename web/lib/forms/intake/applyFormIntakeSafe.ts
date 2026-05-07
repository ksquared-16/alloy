import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { FormIntakeMeta } from "./formLeadCaptureTypes";
import { parseFormIntakeMeta } from "./formLeadCaptureTypes";
import {
    decidePersonMatchFromIdLists,
    normalizeIntakeEmail,
    normalizeIntakePhone,
    phoneLookupVariants,
} from "./intakePersonMatch";
import { parseIntakeAutoCreateFlags } from "./parseIntakeAutoCreateFlags";

async function listPersonIdsByEmail(
    supabase: SupabaseClient,
    orgId: string,
    emailNorm: string
): Promise<string[]> {
    const { data, error } = await supabase.from("persons").select("id").eq("org_id", orgId).ilike("email", emailNorm);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    return [...new Set(ids)];
}

async function listPersonIdsByPhone(supabase: SupabaseClient, orgId: string, phoneNorm: string): Promise<string[]> {
    const variants = phoneLookupVariants(phoneNorm);
    const { data, error } = await supabase.from("persons").select("id").eq("org_id", orgId).in("phone", variants);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    return [...new Set(ids)];
}

async function insertPersonForIntake(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        emailNorm: string | null;
        phoneNorm: string | null;
        first_name: string | null;
        last_name: string | null;
    }
): Promise<string> {
    const { data, error } = await supabase
        .from("persons")
        .insert({
            org_id: params.orgId,
            first_name: params.first_name ?? null,
            last_name: params.last_name ?? null,
            email: params.emailNorm ?? null,
            phone: params.phoneNorm?.length ? params.phoneNorm : null,
        })
        .select("id")
        .single();

    if (!error && data && typeof (data as { id?: string }).id === "string") {
        return (data as { id: string }).id;
    }

    if (error?.code === "23505") {
        if (params.emailNorm) {
            const ids = await listPersonIdsByEmail(supabase, params.orgId, params.emailNorm);
            if (ids.length === 1) return ids[0]!;
        }
        if (params.phoneNorm) {
            const ids = await listPersonIdsByPhone(supabase, params.orgId, params.phoneNorm);
            if (ids.length === 1) return ids[0]!;
        }
    }

    throw new Error(error?.message ?? "Could not create guardian person");
}

export type ApplyFormIntakeSafeInput = {
    orgId: string;
    linkMetadata: Record<string, unknown> | undefined;
    defaultVerticalId?: string | null;
    defaultOpportunityStatusKey?: string | null;
    payload: FormPayload;
    existingPersonId?: string | null;
    existingCustomerId?: string | null;
    existingCustomerMemberId?: string | null;
    existingOpportunityId?: string | null;
};

export type ApplyFormIntakeSafeResult = {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    outcomeMeta: Record<string, unknown>;
};

function outcomeBase(o: Record<string, unknown>): Record<string, unknown> {
    return {
        intake_match_strategy: "none",
        intake_match_confidence: "none",
        intake_needs_review: false,
        intake_candidate_email_count: 0,
        intake_candidate_phone_count: 0,
        ...o,
    };
}

/**
 * Card 8 safe intake: explicit person match (no arbitrary limit(1)), ambiguity → no CRM FKs,
 * auto-create gated by link metadata (defaults off).
 */
export async function applyFormIntakeSafe(
    supabase: SupabaseClient,
    input: ApplyFormIntakeSafeInput
): Promise<ApplyFormIntakeSafeResult> {
    const flags = parseIntakeAutoCreateFlags(input.linkMetadata);
    const meta = parseFormIntakeMeta(input.payload.meta) as FormIntakeMeta | null;
    const intake = meta ?? {};

    const verticalId =
        (typeof intake.vertical_id === "string" ? intake.vertical_id : null) ??
        input.defaultVerticalId ??
        null;
    if (!verticalId?.trim()) {
        throw new Error("lead_capture intake requires vertical_id on payload.meta.intake or link default_vertical_id");
    }

    const g = intake.guardian ?? {};
    const rawEmail = typeof g.email === "string" ? g.email : null;
    const rawPhone = typeof g.phone === "string" ? g.phone : null;
    const emailNorm = normalizeIntakeEmail(rawEmail);
    const phoneNorm = normalizeIntakePhone(rawPhone);
    const first_name = typeof g.first_name === "string" ? g.first_name.trim() || null : null;
    const last_name = typeof g.last_name === "string" ? g.last_name.trim() || null : null;

    if (!emailNorm && !phoneNorm) {
        throw new Error("lead_capture intake requires guardian email or phone in payload.meta.intake");
    }

    let personId = input.existingPersonId?.trim() || null;
    let resolutionPath = "needs_human_review";
    let matchStrategy = "none";
    let confidence: "high" | "medium" | "low" | "none" = "none";
    let emailCount = 0;
    let phoneCount = 0;
    let personCreated = false;

    if (personId) {
        matchStrategy = "reuse_submission_person_id";
        confidence = "medium";
        resolutionPath = "linked_existing_submission";
    } else {
        const emailIds = emailNorm ? await listPersonIdsByEmail(supabase, input.orgId, emailNorm) : [];
        const phoneIds = phoneNorm ? await listPersonIdsByPhone(supabase, input.orgId, phoneNorm) : [];
        emailCount = emailIds.length;
        phoneCount = phoneIds.length;

        const decision = decidePersonMatchFromIdLists({
            emailNorm,
            phoneNorm,
            emailMatchIds: emailIds,
            phoneMatchIds: phoneIds,
        });

        if (decision.kind === "ambiguous_email" || decision.kind === "ambiguous_phone") {
            return {
                person_id: null,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                outcomeMeta: outcomeBase({
                    intake_resolution_path: "ambiguous_contact",
                    intake_match_strategy: decision.kind,
                    intake_match_confidence: "none",
                    intake_needs_review: true,
                    intake_review_reason:
                        decision.kind === "ambiguous_email"
                            ? "Multiple persons share this email — link manually."
                            : "Multiple persons share this phone — link manually.",
                    intake_candidate_email_count: emailCount,
                    intake_candidate_phone_count: phoneCount,
                }),
            };
        }

        if (decision.kind === "matched_email") {
            personId = decision.personId;
            matchStrategy = "matched_email";
            confidence = "high";
            resolutionPath = "matched_email";
        } else if (decision.kind === "matched_phone") {
            personId = decision.personId;
            matchStrategy = "matched_phone";
            confidence = "medium";
            resolutionPath = "matched_phone";
        } else {
            if (!flags.auto_create_person) {
                return {
                    person_id: null,
                    customer_id: null,
                    customer_member_id: null,
                    opportunity_id: null,
                    outcomeMeta: outcomeBase({
                        intake_resolution_path: "needs_human_review",
                        intake_match_strategy: "no_match",
                        intake_match_confidence: "none",
                        intake_needs_review: true,
                        intake_review_reason:
                            "No matching person for email/phone and auto_create_person is disabled on this link.",
                        intake_candidate_email_count: emailCount,
                        intake_candidate_phone_count: phoneCount,
                    }),
                };
            }
            personId = await insertPersonForIntake(supabase, {
                orgId: input.orgId,
                emailNorm,
                phoneNorm,
                first_name,
                last_name,
            });
            personCreated = true;
            matchStrategy = "created_person";
            confidence = "medium";
            resolutionPath = "created_records";
        }
    }

    let customerId = input.existingCustomerId?.trim() || null;
    let opportunityId = input.existingOpportunityId?.trim() || null;
    let customerMemberId = input.existingCustomerMemberId?.trim() || null;

    const { data: cpRow } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("person_id", personId!)
        .eq("org_id", input.orgId)
        .limit(1)
        .maybeSingle();

    if (!customerId && cpRow && typeof (cpRow as { customer_id?: string }).customer_id === "string") {
        customerId = (cpRow as { customer_id: string }).customer_id;
    }

    if (!customerId) {
        if (flags.auto_create_customer) {
            const { customer_id } = await ensureCustomerForPersonNative(supabase, personId!, {
                vertical_id: verticalId,
                org_id: input.orgId,
                first_name,
                last_name,
                email: emailNorm,
                phone: phoneNorm,
            });
            customerId = customer_id;
            await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: personId!, orgId: input.orgId });
        } else {
            return {
                person_id: personId,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                outcomeMeta: outcomeBase({
                    intake_resolution_path: resolutionPath,
                    intake_match_strategy: matchStrategy,
                    intake_match_confidence: confidence,
                    intake_needs_review: true,
                    intake_review_reason:
                        "Person matched or created, but no customer is linked and auto_create_customer is disabled — link or enable auto-create on the public link.",
                    intake_candidate_email_count: emailCount,
                    intake_candidate_phone_count: phoneCount,
                }),
            };
        }
    } else {
        await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: personId!, orgId: input.orgId });
    }

    let memberAutoCreated = false;

    const oppHint = intake.opportunity ?? {};
    const oppName =
        (typeof oppHint.name === "string" && oppHint.name.trim()) ||
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        emailNorm ||
        phoneNorm ||
        "Web intake";
    const status_key =
        (typeof oppHint.status_key === "string" && oppHint.status_key.trim()) ||
        input.defaultOpportunityStatusKey ||
        "new";

    if (!opportunityId && flags.auto_create_opportunity) {
        const oppPayload: Record<string, unknown> = {
            org_id: input.orgId,
            vertical_id: verticalId,
            customer_id: customerId,
            primary_person_id: personId,
            primary_contact_id: null,
            name: oppName,
            status: "open",
            source: "public_form",
            status_key,
            metadata: {
                ...(typeof oppHint.metadata === "object" && oppHint.metadata ? oppHint.metadata : {}),
                form_intake: true,
                idempotency_key: intake.idempotency_key ?? null,
            },
        };
        const stageId =
            typeof oppHint.pipeline_stage_id === "string" && oppHint.pipeline_stage_id.trim()
                ? oppHint.pipeline_stage_id.trim()
                : null;
        if (stageId) oppPayload.pipeline_stage_id = stageId;

        await normalizeOpportunityWritePayload(supabase, oppPayload, "forms/applyFormIntakeSafe");

        const { data: oppRow, error: oppErr } = await supabase.from("opportunities").insert(oppPayload).select("id").single();
        if (oppErr || !oppRow) throw new Error(oppErr?.message ?? "Opportunity insert failed");
        opportunityId = (oppRow as { id: string }).id;

        const { error: opErr } = await supabase.from("opportunity_persons").insert({
            org_id: input.orgId,
            opportunity_id: opportunityId,
            person_id: personId,
            role_type: "family_member",
            metadata: { source: "public_form_intake", role: "primary_guardian" },
        });
        if (opErr && opErr.code !== "23505") {
            throw new Error(`opportunity_persons insert failed: ${opErr.message}`);
        }
    }

    const child = intake.child;
    const hasChild =
        child &&
        typeof child === "object" &&
        ((typeof child.display_name === "string" && child.display_name.trim()) ||
            (typeof child.first_name === "string" && child.first_name.trim()));

    if (
        hasChild &&
        flags.auto_create_customer_member &&
        customerId &&
        opportunityId &&
        !customerMemberId
    ) {
        const ch = child!;
        const display =
            (typeof ch.display_name === "string" && ch.display_name.trim()) ||
            [ch.first_name, ch.last_name].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() ||
            "Child";
        const cmPayload: Record<string, unknown> = {
            org_id: input.orgId,
            customer_id: customerId,
            display_name: display,
            first_name: typeof ch.first_name === "string" ? ch.first_name.trim() || null : null,
            last_name: typeof ch.last_name === "string" ? ch.last_name.trim() || null : null,
            dob: typeof ch.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ch.dob) ? ch.dob : null,
            relationship: "child",
            metadata: { source: "public_form_intake", needs_review: true },
        };

        const { data: cm, error: cmErr } = await supabase.from("customer_members").insert(cmPayload).select("id").single();
        if (cmErr || !cm) throw new Error(cmErr?.message ?? "customer_members insert failed");
        customerMemberId = (cm as { id: string }).id;

        const { error: ocmErr } = await supabase.from("opportunity_customer_members").insert({
            org_id: input.orgId,
            opportunity_id: opportunityId,
            customer_member_id: customerMemberId,
            metadata: { source: "public_form_intake", needs_review: true },
        });
        if (ocmErr && ocmErr.code !== "23505") {
            throw new Error(`opportunity_customer_members insert failed: ${ocmErr.message}`);
        }
        memberAutoCreated = true;
    }

    const intakeNeedsReview =
        matchStrategy === "reuse_submission_person_id"
            ? false
            : personCreated || matchStrategy === "matched_phone" || memberAutoCreated;

    let intakeReviewReason: string | undefined;
    if (intakeNeedsReview) {
        if (personCreated) {
            intakeReviewReason =
                "A new person record was created from this form — verify identity before generating documents.";
        } else if (matchStrategy === "matched_phone") {
            intakeReviewReason =
                "Person was matched by phone only — verify identity before generating documents.";
        } else if (memberAutoCreated) {
            intakeReviewReason =
                "A child customer member was auto-created — verify household linkage before generating documents.";
        } else {
            intakeReviewReason =
                "Verify CRM linkage before generating documents.";
        }
    }

    const outcomeMeta = outcomeBase({
        intake_resolution_path: resolutionPath,
        intake_match_strategy: matchStrategy,
        intake_match_confidence: confidence,
        intake_needs_review: intakeNeedsReview,
        intake_review_reason: intakeReviewReason,
        intake_candidate_email_count: emailCount,
        intake_candidate_phone_count: phoneCount,
    });

    return {
        person_id: personId,
        customer_id: customerId,
        customer_member_id: customerMemberId,
        opportunity_id: opportunityId,
        outcomeMeta,
    };
}
