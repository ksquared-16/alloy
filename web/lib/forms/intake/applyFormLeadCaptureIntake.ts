import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCustomerForPersonNative } from "@/lib/bookingPersonCustomerResolve";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import type { FormIntakeMeta } from "./formLeadCaptureTypes";
import { parseFormIntakeMeta } from "./formLeadCaptureTypes";
import { normalizeIntakeOpportunityStatusKey } from "./normalizeIntakeOpportunityStatusKey";
import { parseIntakeLinkDefaults } from "./parseIntakeLinkDefaults";
import { applyIntakeChildToOpportunity } from "./applyIntakeChildToOpportunity";
import { listIntakeChildrenFromMeta } from "./listIntakeChildrenFromMeta";

export type ApplyFormLeadCaptureIntakeInput = {
    orgId: string;
    linkMetadata?: Record<string, unknown> | undefined;
    defaultVerticalId?: string | null;
    defaultOpportunityStatusKey?: string | null;
    payload: FormPayload;
    existingPersonId?: string | null;
    existingCustomerId?: string | null;
    existingCustomerMemberId?: string | null;
    existingOpportunityId?: string | null;
};

export type ApplyFormLeadCaptureIntakeResult = {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    resolution_path: string;
};

/**
 * Person-first CRM linkage for public lead capture. Reuses booking-native person/customer helpers (no contacts).
 */
export async function applyFormLeadCaptureIntake(
    supabase: SupabaseClient,
    input: ApplyFormLeadCaptureIntakeInput
): Promise<ApplyFormLeadCaptureIntakeResult> {
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
    const email = typeof g.email === "string" ? g.email.trim() || null : null;
    const phone = typeof g.phone === "string" ? g.phone.trim() || null : null;
    const first_name = typeof g.first_name === "string" ? g.first_name.trim() || null : null;
    const last_name = typeof g.last_name === "string" ? g.last_name.trim() || null : null;

    if (!email && !phone) {
        throw new Error("lead_capture intake requires guardian email or phone in payload.meta.intake");
    }

    let personId = input.existingPersonId?.trim() || null;
    if (!personId) {
        const created = await findOrCreatePersonInOrgWithMeta(supabase, {
            email,
            phone,
            first_name,
            last_name,
            org_id: input.orgId,
        });
        if (!created?.id) throw new Error("Could not resolve or create guardian person");
        personId = created.id;
    }

    let customerId = input.existingCustomerId?.trim() || null;
    if (!customerId) {
        const { customer_id } = await ensureCustomerForPersonNative(supabase, personId, {
            vertical_id: verticalId,
            org_id: input.orgId,
            first_name,
            last_name,
            email,
            phone,
        });
        customerId = customer_id;
        await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId, orgId: input.orgId });
    }

    let opportunityId = input.existingOpportunityId?.trim() || null;
    const oppHint = intake.opportunity ?? {};
    const oppName =
        (typeof oppHint.name === "string" && oppHint.name.trim()) ||
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        email ||
        phone ||
        "Web intake";

    const status_key = normalizeIntakeOpportunityStatusKey(
        (typeof oppHint.status_key === "string" && oppHint.status_key.trim()) ||
            input.defaultOpportunityStatusKey ||
            null
    );

    if (!opportunityId) {
        const oppPayload: Record<string, unknown> = {
            org_id: input.orgId,
            vertical_id: verticalId,
            customer_id: customerId,
            primary_person_id: personId,
            primary_contact_id: null,
            name: oppName,
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

        const linkDefaults = parseIntakeLinkDefaults(input.linkMetadata);
        if (linkDefaults.default_location_id) {
            oppPayload.location_id = linkDefaults.default_location_id;
        }

        const hintStage =
            typeof (oppHint as { stage_key?: unknown }).stage_key === "string"
                ? String((oppHint as { stage_key: string }).stage_key).trim()
                : "";
        if (hintStage) {
            oppPayload.stage_key = hintStage;
            oppPayload.stage_entered_at = new Date().toISOString();
        }

        await normalizeOpportunityWritePayload(supabase, oppPayload, "forms/applyFormLeadCaptureIntake");

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

    let customerMemberId = input.existingCustomerMemberId?.trim() || null;
    const linkDefaults = parseIntakeLinkDefaults(input.linkMetadata);
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

    if (intakeChildren.length > 0 && customerId && opportunityId) {
        for (let i = 0; i < intakeChildren.length; i++) {
            const applied = await applyIntakeChildToOpportunity(supabase, {
                orgId: input.orgId,
                opportunityId,
                customerId,
                child: intakeChildren[i]!,
                opportunityLocationId,
                linkDefaultLocationId: linkDefaults.default_location_id,
                reuseCustomerMemberId: i === 0 && intakeChildren.length === 1 ? customerMemberId : null,
                needsReview: false,
            });
            if (applied && !customerMemberId) customerMemberId = applied.customer_member_id;
        }
    }

    return {
        person_id: personId,
        customer_id: customerId,
        customer_member_id: customerMemberId,
        opportunity_id: opportunityId,
        resolution_path: "applied",
    };
}
