/**
 * Related-subject resolution: family/opportunity context → eligible child Enrollment
 * participations (OCM rows) for commands such as waitlist_child.
 *
 * Household children (`customer_members.relationship = child`) are authoritative for
 * "who belongs to this family." Missing OCM participation rows are ensured so Waitlist
 * can execute against child Enrollment grain — never invent subjects, never pick first
 * of many without operator choice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import { resolveChildProcessStageLabel } from "@/lib/lifecycle/childEnrollmentProcessStageLabel";

export type EligibleEnrollmentChildSubject = {
    /** opportunity_customer_members.id */
    id: string;
    label: string;
    grain: "opportunity_customer_member";
    customerMemberId: string;
};

export type ResolveEligibleEnrollmentChildrenResult =
    | { status: "none"; message: string; subjects: [] }
    | { status: "single"; subject: EligibleEnrollmentChildSubject; subjects: [EligibleEnrollmentChildSubject] }
    | {
          status: "multiple";
          subjects: EligibleEnrollmentChildSubject[];
          message: string;
      };

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
}

function childDisplayName(cm: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
} | null | undefined): string {
    const display = trimOrNull(cm?.display_name);
    if (display) return display;
    const joined = [cm?.first_name, cm?.last_name].map(trimOrNull).filter(Boolean).join(" ");
    return joined || "Child";
}

/**
 * Operator-facing context after the child name: location + Process Stage label.
 * Never title-case raw keys — `new_inquiry` must render as New Lead (stage), never "New Inquiry".
 */
function formatChildContextBits(args: {
    locationLabel: string | null;
    stageKey: string | null;
    outcomeStatusKey: string | null;
}): string[] {
    const stageLabel = resolveChildProcessStageLabel({
        stageKey: args.stageKey,
        dispositionKey: args.outcomeStatusKey,
    });
    return [args.locationLabel, stageLabel].filter(Boolean) as string[];
}

/**
 * Load eligible child Enrollment subjects for an opportunity.
 * Resolves household children first; ensures OCM participation so execute stays on
 * opportunity_customer_member grain.
 */
export async function resolveEligibleEnrollmentChildrenForOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<ResolveEligibleEnrollmentChildrenResult> {
    const opportunityId = params.opportunityId.trim();
    if (!opportunityId) {
        return {
            status: "none",
            subjects: [],
            message: "Choose a family record before moving a child to Waitlist.",
        };
    }

    const { data: opportunity, error: oppError } = await params.supabase
        .from("opportunities")
        .select("id, customer_id, location_id, locations(label)")
        .eq("org_id", params.orgId)
        .eq("id", opportunityId)
        .maybeSingle();

    if (oppError || !opportunity?.id) {
        return {
            status: "none",
            subjects: [],
            message: "Could not load this family record. Try again.",
        };
    }

    const customerId = trimOrNull((opportunity as { customer_id?: string | null }).customer_id);
    const locationLabel = trimOrNull(
        (opportunity as { locations?: { label?: string | null } | null }).locations?.label,
    );
    if (!customerId) {
        return {
            status: "none",
            subjects: [],
            message: "This family record has no household yet. Add a child before moving to Waitlist.",
        };
    }

    const { data: householdChildren, error: childrenError } = await params.supabase
        .from("customer_members")
        .select("id, first_name, last_name, display_name, relationship, is_active")
        .eq("org_id", params.orgId)
        .eq("customer_id", customerId)
        .eq("relationship", "child")
        .eq("is_active", true);

    if (childrenError) {
        return {
            status: "none",
            subjects: [],
            message: "Could not load children for this family. Try again.",
        };
    }

    const childMembers = (householdChildren ?? []).filter((row) => trimOrNull((row as { id?: string }).id));
    if (childMembers.length === 0) {
        return {
            status: "none",
            subjects: [],
            message: "Add a child to this family before moving them to Waitlist.",
        };
    }

    const { data: existingOcms, error: ocmError } = await params.supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, outcome_status_key, stage_key, location_id, customer_members(first_name, last_name, display_name)",
        )
        .eq("org_id", params.orgId)
        .eq("opportunity_id", opportunityId);

    if (ocmError) {
        return {
            status: "none",
            subjects: [],
            message: "Could not load children for this family. Try again.",
        };
    }

    const ocmByMemberId = new Map<
        string,
        {
            id: string;
            outcome_status_key?: string | null;
            stage_key?: string | null;
            location_id?: string | null;
            customer_members?: {
                first_name?: string | null;
                last_name?: string | null;
                display_name?: string | null;
            } | null;
        }
    >();
    for (const row of existingOcms ?? []) {
        const rec = row as {
            id?: string;
            customer_member_id?: string | null;
            outcome_status_key?: string | null;
            stage_key?: string | null;
            location_id?: string | null;
            customer_members?: {
                first_name?: string | null;
                last_name?: string | null;
                display_name?: string | null;
            } | null;
        };
        const memberId = trimOrNull(rec.customer_member_id);
        const ocmId = trimOrNull(rec.id);
        if (!memberId || !ocmId) continue;
        ocmByMemberId.set(memberId, {
            id: ocmId,
            outcome_status_key: rec.outcome_status_key,
            stage_key: rec.stage_key,
            location_id: rec.location_id,
            customer_members: rec.customer_members,
        });
    }

    const subjects: EligibleEnrollmentChildSubject[] = [];
    for (const member of childMembers) {
        const memberRec = member as {
            id?: string;
            first_name?: string | null;
            last_name?: string | null;
            display_name?: string | null;
        };
        const customerMemberId = trimOrNull(memberRec.id);
        if (!customerMemberId) continue;

        let ocm = ocmByMemberId.get(customerMemberId) ?? null;
        if (!ocm) {
            try {
                const ensured = await ensureOpportunityCustomerMemberParticipation({
                    supabase: params.supabase,
                    orgId: params.orgId,
                    opportunityId,
                    customerMemberId,
                    source: "eligible_enrollment_children",
                });
                ocm = {
                    id: ensured.ocmId,
                    outcome_status_key: null,
                    stage_key: null,
                    location_id: null,
                    customer_members: {
                        first_name: memberRec.first_name,
                        last_name: memberRec.last_name,
                        display_name: memberRec.display_name,
                    },
                };
            } catch {
                return {
                    status: "none",
                    subjects: [],
                    message: "Could not prepare enrollment for a child on this family. Try again.",
                };
            }
        }

        const name = childDisplayName(ocm.customer_members ?? memberRec);
        const contextBits = formatChildContextBits({
            locationLabel,
            stageKey: trimOrNull(ocm.stage_key),
            outcomeStatusKey: trimOrNull(ocm.outcome_status_key),
        });
        subjects.push({
            id: ocm.id,
            label: contextBits.length > 0 ? `${name} · ${contextBits.join(" · ")}` : name,
            grain: "opportunity_customer_member",
            customerMemberId,
        });
    }

    return classifyEligibleEnrollmentChildren(subjects);
}

/** Pure classification for tests / intent plans that already have subject lists. */
export function classifyEligibleEnrollmentChildren(
    subjects: readonly EligibleEnrollmentChildSubject[],
): ResolveEligibleEnrollmentChildrenResult {
    if (subjects.length === 0) {
        return {
            status: "none",
            subjects: [],
            message: "Add a child to this family before moving them to Waitlist.",
        };
    }
    if (subjects.length === 1) {
        return { status: "single", subject: subjects[0]!, subjects: [subjects[0]!] };
    }
    return {
        status: "multiple",
        subjects: [...subjects],
        message: "Who should move to Waitlist?",
    };
}
