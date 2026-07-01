/**
 * Create or reuse customer_member + OCM for one intake child (Card 4).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormIntakeChildHint } from "@/lib/forms/intake/formLeadCaptureTypes";
import { findCustomerMemberIdOnOpportunity } from "@/lib/forms/intake/intakeOpportunityDedup";
import {
    buildOcmInsertFromIntakeChildFields,
    resolveIntakeChildOcmFields,
} from "@/lib/forms/intake/resolveIntakeChildOcmFields";

export type ApplyIntakeChildToOpportunityParams = {
    orgId: string;
    opportunityId: string;
    customerId: string;
    child: FormIntakeChildHint;
    opportunityLocationId?: string | null;
    linkDefaultLocationId?: string | null;
    /** When set and names match, reuse this member instead of inserting (single-child idempotency). */
    reuseCustomerMemberId?: string | null;
    needsReview?: boolean;
};

export type ApplyIntakeChildToOpportunityResult = {
    customer_member_id: string;
    ocm_fields: ReturnType<typeof resolveIntakeChildOcmFields>;
    member_created: boolean;
    ocm_created: boolean;
};

export async function applyIntakeChildToOpportunity(
    supabase: SupabaseClient,
    params: ApplyIntakeChildToOpportunityParams
): Promise<ApplyIntakeChildToOpportunityResult | null> {
    const ch = params.child;
    const hasChild =
        (typeof ch.display_name === "string" && ch.display_name.trim()) ||
        (typeof ch.first_name === "string" && ch.first_name.trim());
    if (!hasChild) return null;

    const ocmFields = resolveIntakeChildOcmFields({
        child: ch,
        opportunityLocationId: params.opportunityLocationId,
        linkDefaultLocationId: params.linkDefaultLocationId,
    });

    let customerMemberId = (params.reuseCustomerMemberId ?? "").trim() || null;
    let memberCreated = false;

    if (!customerMemberId) {
        const existingMemberId = await findCustomerMemberIdOnOpportunity(
            supabase,
            params.orgId,
            params.opportunityId,
            typeof ch.first_name === "string" ? ch.first_name : null,
            typeof ch.last_name === "string" ? ch.last_name : null
        );
        if (existingMemberId) {
            customerMemberId = existingMemberId;
        }
    }

    if (!customerMemberId) {
        const display =
            (typeof ch.display_name === "string" && ch.display_name.trim()) ||
            [ch.first_name, ch.last_name].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() ||
            "Child";
        const cmPayload: Record<string, unknown> = {
            org_id: params.orgId,
            customer_id: params.customerId,
            display_name: display,
            first_name: typeof ch.first_name === "string" ? ch.first_name.trim() || null : null,
            last_name: typeof ch.last_name === "string" ? ch.last_name.trim() || null : null,
            dob: typeof ch.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ch.dob) ? ch.dob : null,
            relationship: "child",
            metadata: { source: "public_form_intake" },
        };

        const { data: cm, error: cmErr } = await supabase
            .from("customer_members")
            .insert(cmPayload)
            .select("id")
            .single();
        if (cmErr || !cm) throw new Error(cmErr?.message ?? "customer_members insert failed");
        customerMemberId = (cm as { id: string }).id;
        memberCreated = true;
    }

    const ocmBaseMeta: Record<string, unknown> = {
        source: "public_form_intake",
        ...(params.needsReview !== false ? { needs_review: true } : {}),
    };
    const ocmRow = buildOcmInsertFromIntakeChildFields(ocmFields, {
        org_id: params.orgId,
        opportunity_id: params.opportunityId,
        customer_member_id: customerMemberId,
        metadata: ocmBaseMeta,
    });

    const { error: ocmErr } = await supabase.from("opportunity_customer_members").insert(ocmRow);
    let ocmCreated = true;
    if (ocmErr) {
        if (ocmErr.code === "23505") {
            ocmCreated = false;
        } else {
            throw new Error(`opportunity_customer_members insert failed: ${ocmErr.message}`);
        }
    }

    return {
        customer_member_id: customerMemberId,
        ocm_fields: ocmFields,
        member_created: memberCreated,
        ocm_created: ocmCreated,
    };
}
