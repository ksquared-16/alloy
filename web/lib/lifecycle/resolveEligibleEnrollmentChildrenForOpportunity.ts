/**
 * Related-subject resolution: family/opportunity context → eligible child Enrollment
 * participations (OCM rows) for commands such as waitlist_child.
 *
 * Exactly one eligible child → auto-resolve.
 * Zero or many → fail closed (never invent / never pick first of many).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Load OCMs for an opportunity that can receive child Enrollment progression.
 * Eligibility for this slice: any linked opportunity_customer_member with a child identity.
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

    const { data, error } = await params.supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, customer_members(first_name, last_name, display_name)")
        .eq("org_id", params.orgId)
        .eq("opportunity_id", opportunityId);

    if (error) {
        return {
            status: "none",
            subjects: [],
            message: "Could not load children for this family. Try again.",
        };
    }

    const subjects: EligibleEnrollmentChildSubject[] = [];
    for (const row of data ?? []) {
        const rec = row as {
            id?: string;
            customer_member_id?: string | null;
            customer_members?: {
                first_name?: string | null;
                last_name?: string | null;
                display_name?: string | null;
            } | null;
        };
        const ocmId = trimOrNull(rec.id);
        const customerMemberId = trimOrNull(rec.customer_member_id);
        if (!ocmId || !customerMemberId) continue;
        subjects.push({
            id: ocmId,
            label: childDisplayName(rec.customer_members),
            grain: "opportunity_customer_member",
            customerMemberId,
        });
    }

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
        subjects,
        message:
            "This family has more than one child. Choose which child to move to Waitlist.",
    };
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
        message:
            "This family has more than one child. Choose which child to move to Waitlist.",
    };
}
