import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { FormIntakeMeta } from "./formLeadCaptureTypes";
import { parseFormIntakeMeta } from "./formLeadCaptureTypes";
import {
    decidePersonMatchFromIdLists,
    formatPersonDisplayName,
    normalizeIntakeEmail,
    normalizeIntakePhone,
    submittedIdentityMatchesPersonRecord,
} from "./intakePersonMatch";
import { listPersonIdsByEmail, listPersonIdsByPhone } from "./intakeIdentityLookups";
import { parseIntakeAutoCreateFlags } from "./parseIntakeAutoCreateFlags";
import { parseIntakeLinkDefaults, resolveIntakeOpportunitySource } from "./parseIntakeLinkDefaults";
import { normalizeIntakeOpportunityStatusKey } from "./normalizeIntakeOpportunityStatusKey";
import {
    intakeReviewDecisionToOutcomeMeta,
    resolveIntakeReviewDecision,
} from "./resolveIntakeReviewDecision";
import { findExistingIntakeOpportunity, resolveIntakeWorkUnitId } from "./intakeOpportunityDedup";
import { applyIntakeChildToOpportunity } from "./applyIntakeChildToOpportunity";
import { listIntakeChildrenFromMeta } from "./listIntakeChildrenFromMeta";

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
 * Retired public-form direct-write authority (E1 / certification).
 * Active routes use `ingestPublicFormThroughProcessing`. Legacy implementation
 * lives in `applyFormIntakeDirectWriteLegacy.ts` for migration archaeology only.
 */
export async function applyFormIntakeSafe(
    _supabase: SupabaseClient,
    _input: ApplyFormIntakeSafeInput,
): Promise<ApplyFormIntakeSafeResult> {
    throw new Error(
        "applyFormIntakeSafe direct-write authority retired (E1). Use ingestPublicFormThroughProcessing.",
    );
}

/** @deprecated Unreachable from routes — see applyFormIntakeDirectWriteLegacy.ts */
export async function applyFormIntakeDirectWriteLegacy(
    supabase: SupabaseClient,
    input: ApplyFormIntakeSafeInput
): Promise<ApplyFormIntakeSafeResult> {
    const flags = parseIntakeAutoCreateFlags(input.linkMetadata);
    const linkDefaults = parseIntakeLinkDefaults(input.linkMetadata);
    const intakeSource = resolveIntakeOpportunitySource(input.linkMetadata);
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
    let identityNameMismatch = false;
    let matchedPersonDisplayName: string | null = null;

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

    if (
        personId &&
        !personCreated &&
        (matchStrategy === "matched_email" || matchStrategy === "matched_phone")
    ) {
        const { data: personRow } = await supabase
            .from("persons")
            .select("first_name, last_name")
            .eq("org_id", input.orgId)
            .eq("id", personId)
            .maybeSingle();
        const personFirst = (personRow as { first_name?: string | null } | null)?.first_name ?? null;
        const personLast = (personRow as { last_name?: string | null } | null)?.last_name ?? null;
        matchedPersonDisplayName = formatPersonDisplayName(personFirst, personLast);
        identityNameMismatch = !submittedIdentityMatchesPersonRecord({
            submittedFirstName: first_name,
            submittedLastName: last_name,
            personFirstName: personFirst,
            personLastName: personLast,
        });
        if (identityNameMismatch) {
            resolutionPath = "needs_human_review";
            confidence = "low";
        }
    }

    let customerId = input.existingCustomerId?.trim() || null;
    let opportunityId = input.existingOpportunityId?.trim() || null;
    let customerMemberId = input.existingCustomerMemberId?.trim() || null;

    let opportunityDedupStrategy: "created" | "attached_existing" | "ambiguous" | "skipped" = "skipped";
    if (opportunityId && !flags.auto_create_opportunity) {
        opportunityDedupStrategy = "attached_existing";
        if (personId) {
            matchStrategy = matchStrategy === "none" ? "launch_context" : matchStrategy;
            confidence = "high";
            resolutionPath = "linked_existing_submission";
        }
    }
    let workUnitDepartmentMismatch = false;
    let intakeRoutingWorkUnitId: string | null = linkDefaults.default_work_unit_id;
    const intakeRoutingDepartmentId: string | null = linkDefaults.default_department_id;

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
    const status_key = normalizeIntakeOpportunityStatusKey(
        (typeof oppHint.status_key === "string" && oppHint.status_key.trim()) ||
            linkDefaults.default_opportunity_status_key ||
            input.defaultOpportunityStatusKey ||
            null
    );

    if (!opportunityId && flags.auto_create_opportunity) {
        const childHint = intake.child;
        const childFirst =
            childHint && typeof childHint === "object" && typeof childHint.first_name === "string"
                ? childHint.first_name
                : null;
        const childLast =
            childHint && typeof childHint === "object" && typeof childHint.last_name === "string"
                ? childHint.last_name
                : null;

        const dedup =
            identityNameMismatch ?
                ({ kind: "no_match" } as const)
            :   await findExistingIntakeOpportunity(supabase, {
                    orgId: input.orgId,
                    personId: personId!,
                    locationId: linkDefaults.default_location_id,
                    childFirst,
                    childLast,
                });

        if (dedup.kind === "ambiguous") {
            return {
                person_id: personId,
                customer_id: customerId,
                customer_member_id: customerMemberId,
                opportunity_id: null,
                outcomeMeta: outcomeBase({
                    intake_resolution_path: "ambiguous_opportunity",
                    intake_match_strategy: matchStrategy,
                    intake_match_confidence: confidence,
                    intake_needs_review: true,
                    intake_review_reason:
                        "Multiple open opportunities match this guardian, child, and location — link manually.",
                    intake_opportunity_match: "ambiguous",
                    intake_opportunity_candidate_ids: dedup.candidateIds,
                    intake_candidate_email_count: emailCount,
                    intake_candidate_phone_count: phoneCount,
                }),
            };
        }

        if (dedup.kind === "matched") {
            opportunityId = dedup.opportunityId;
            opportunityDedupStrategy = "attached_existing";
        } else {
            const workUnitResolved = await resolveIntakeWorkUnitId(
                supabase,
                input.orgId,
                linkDefaults.default_work_unit_id,
                linkDefaults.default_department_id
            );
            workUnitDepartmentMismatch = workUnitResolved.department_mismatch;
            intakeRoutingWorkUnitId = workUnitResolved.work_unit_id;

            const oppPayload: Record<string, unknown> = {
                org_id: input.orgId,
                vertical_id: verticalId,
                customer_id: customerId,
                primary_person_id: personId,
                primary_contact_id: null,
                name: oppName,
                source: intakeSource,
                status_key,
                metadata: {
                    ...(typeof oppHint.metadata === "object" && oppHint.metadata ? oppHint.metadata : {}),
                    form_intake: true,
                    idempotency_key: intake.idempotency_key ?? null,
                },
            };
            if (linkDefaults.default_location_id) {
                oppPayload.location_id = linkDefaults.default_location_id;
            }
            if (workUnitResolved.work_unit_id) {
                oppPayload.work_unit_id = workUnitResolved.work_unit_id;
            }
            const stageId =
                typeof oppHint.pipeline_stage_id === "string" && oppHint.pipeline_stage_id.trim()
                    ? oppHint.pipeline_stage_id.trim()
                    : null;
            if (stageId) oppPayload.pipeline_stage_id = stageId;

            await normalizeOpportunityWritePayload(supabase, oppPayload, "forms/applyFormIntakeSafe");

            const { data: oppRow, error: oppErr } = await supabase
                .from("opportunities")
                .insert(oppPayload)
                .select("id")
                .single();
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
            opportunityDedupStrategy = "created";
        }
    }

    const intakeChildren = listIntakeChildrenFromMeta(intake);
    let opportunityLocationId: string | null = linkDefaults.default_location_id;
    if (opportunityId) {
        const { data: oppLocRow } = await supabase
            .from("opportunities")
            .select("location_id")
            .eq("id", opportunityId)
            .eq("org_id", input.orgId)
            .maybeSingle();
        opportunityLocationId =
            (oppLocRow as { location_id?: string | null } | null)?.location_id ?? opportunityLocationId;
    }

    if (
        intakeChildren.length > 0 &&
        flags.auto_create_customer_member &&
        customerId &&
        opportunityId
    ) {
        const linkedMemberIds: string[] = [];
        for (let i = 0; i < intakeChildren.length; i++) {
            const ch = intakeChildren[i]!;
            const reuseId =
                i === 0 && intakeChildren.length === 1 ? customerMemberId : null;
            const applied = await applyIntakeChildToOpportunity(supabase, {
                orgId: input.orgId,
                opportunityId,
                customerId,
                child: ch,
                opportunityLocationId,
                linkDefaultLocationId: linkDefaults.default_location_id,
                reuseCustomerMemberId: reuseId,
                needsReview: true,
            });
            if (!applied) continue;
            linkedMemberIds.push(applied.customer_member_id);
            if (applied.member_created) memberAutoCreated = true;
        }
        if (linkedMemberIds.length === 1) {
            customerMemberId = linkedMemberIds[0]!;
        } else if (linkedMemberIds.length > 1) {
            customerMemberId = linkedMemberIds[0]!;
        }
    }

    const reviewDecision = resolveIntakeReviewDecision({
        linkMetadata: input.linkMetadata,
        matchStrategy,
        matchConfidence: confidence,
        emailPresent: !!emailNorm,
        phonePresent: !!phoneNorm,
        personCreated,
        memberAutoCreated,
        workUnitDepartmentMismatch,
        opportunityDedupStrategy,
        autoCreateOpportunity: flags.auto_create_opportunity,
        hasOpportunity: !!opportunityId,
        hasCustomer: !!customerId,
        hasPerson: !!personId,
        identityNameMismatchWithMatchedPerson: identityNameMismatch,
    });

    const outcomeMeta = outcomeBase({
        intake_resolution_path: resolutionPath,
        intake_match_strategy: matchStrategy,
        intake_match_confidence: confidence,
        intake_candidate_email_count: emailCount,
        intake_candidate_phone_count: phoneCount,
        ...(identityNameMismatch ?
            {
                intake_identity_name_mismatch: true,
                intake_submitted_guardian_first_name: first_name,
                intake_submitted_guardian_last_name: last_name,
                intake_matched_person_display_name: matchedPersonDisplayName,
                intake_review_reason:
                    "Email or phone matches an existing family, but the submitted name differs — confirm the match before continuing.",
            }
        :   {}),
        ...(opportunityDedupStrategy !== "skipped" ? { intake_opportunity_match: opportunityDedupStrategy } : {}),
        ...(workUnitDepartmentMismatch ? { intake_work_unit_department_mismatch: true } : {}),
        ...(intakeRoutingWorkUnitId ? { intake_routing_work_unit_id: intakeRoutingWorkUnitId } : {}),
        ...(intakeRoutingDepartmentId ? { intake_routing_department_id: intakeRoutingDepartmentId } : {}),
        ...(intakeChildren.length > 1 ? { intake_children_linked_count: intakeChildren.length } : {}),
        ...intakeReviewDecisionToOutcomeMeta(reviewDecision),
    });

    return {
        person_id: personId,
        customer_id: customerId,
        customer_member_id: customerMemberId,
        opportunity_id: opportunityId,
        outcomeMeta,
    };
}
