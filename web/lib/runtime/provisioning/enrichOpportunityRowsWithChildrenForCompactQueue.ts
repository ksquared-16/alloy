/**
 * Attach household / CRM-compact children onto a bounded opportunity queue page
 * so CondensedQueueRow Secondary (`children.names` / `children.count`) can resolve.
 *
 * QueueService already attaches `_inquiry_children` / `_crm_compact_children` /
 * `_household_children`. D1 operational projection enrichment historically only
 * ran the thin CRM contact projection — Secondary stayed empty despite published
 * groupCount fieldKeys. This module closes that gap without importing QueueService.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isActiveChildCustomerMemberForInquiry } from "@/lib/admin/drawer/inquiryChildrenHydration";

export type OpportunityChildrenCompactProjection = {
    _crm_compact_children?: Array<{
        primary: string;
        secondary: string | null;
        personId?: string | null;
        customerMemberId?: string | null;
    }>;
    _household_children?: Array<Record<string, unknown>>;
    _inquiry_children?: unknown[];
    _child_display_name?: string | null;
};

function trimId(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text || null;
}

function displayNameForMember(row: Record<string, unknown>): string | null {
    const display = trimId(row.display_name);
    if (display) return display;
    const composed = [trimId(row.first_name), trimId(row.last_name)].filter(Boolean).join(" ").trim();
    return composed || null;
}

function readMetadataInquiryChildren(metadata: unknown): unknown[] {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const ic = (metadata as { inquiry_children?: unknown }).inquiry_children;
    if (!Array.isArray(ic)) return [];
    return ic.filter((row) => row != null && typeof row === "object");
}

/**
 * Batch-load active child members for the given opportunity page and return
 * per-opportunity compact children fields for Secondary band resolution.
 */
export async function enrichOpportunityRowsWithChildrenForCompactQueue(
    supabase: SupabaseClient,
    orgId: string,
    rows: ReadonlyArray<{
        id: string;
        customer_id?: string | null;
        metadata?: unknown;
    }>,
): Promise<Map<string, OpportunityChildrenCompactProjection>> {
    const out = new Map<string, OpportunityChildrenCompactProjection>();
    if (!rows.length) return out;

    const opportunityIds = rows.map((row) => String(row.id).trim()).filter(Boolean);
    const customerIds = [
        ...new Set(rows.map((row) => trimId(row.customer_id)).filter((id): id is string => Boolean(id))),
    ];

    // Seed from metadata.inquiry_children when present (no extra DB).
    for (const row of rows) {
        const inquiryChildren = readMetadataInquiryChildren(row.metadata);
        if (!inquiryChildren.length) continue;
        const lines = inquiryChildren
            .map((raw) => {
                const child = raw as Record<string, unknown>;
                const primary = displayNameForMember(child);
                if (!primary) return null;
                return {
                    primary,
                    secondary: null as string | null,
                    personId: trimId(child.person_id),
                    customerMemberId: trimId(child.customer_member_id) ?? trimId(child.id),
                };
            })
            .filter((line): line is NonNullable<typeof line> => Boolean(line));
        if (!lines.length) continue;
        out.set(String(row.id), {
            _inquiry_children: inquiryChildren,
            _crm_compact_children: lines,
            _child_display_name: lines[0]?.primary ?? null,
        });
    }

    type MemberRow = {
        id: string;
        customer_id: string;
        person_id: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        dob: string | null;
        relationship: string | null;
        is_active: boolean | null;
    };

    const membersByCustomerId = new Map<string, MemberRow[]>();
    if (customerIds.length) {
        const { data } = await supabase
            .from("customer_members")
            .select("id, customer_id, person_id, display_name, first_name, last_name, dob, relationship, is_active")
            .eq("org_id", orgId)
            .in("customer_id", customerIds)
            .eq("is_active", true)
            .limit(500);
        for (const raw of data ?? []) {
            const row = raw as MemberRow;
            if (!isActiveChildCustomerMemberForInquiry(row as unknown as Record<string, unknown>)) continue;
            const list = membersByCustomerId.get(row.customer_id) ?? [];
            list.push(row);
            membersByCustomerId.set(row.customer_id, list);
        }
    }

    // OCM join for opportunities that lack customer_id but have linked members.
    const ocmByOpportunityId = new Map<string, MemberRow[]>();
    if (opportunityIds.length) {
        const { data } = await supabase
            .from("opportunity_customer_members")
            .select(
                "opportunity_id, customer_member_id, customer_members(id, person_id, display_name, first_name, last_name, dob, relationship, is_active, customer_id)",
            )
            .eq("org_id", orgId)
            .in("opportunity_id", opportunityIds)
            .limit(800);
        for (const raw of data ?? []) {
            const link = raw as {
                opportunity_id: string;
                customer_members?: MemberRow | MemberRow[] | null;
            };
            const memberRaw = Array.isArray(link.customer_members)
                ? link.customer_members[0]
                : link.customer_members;
            if (!memberRaw || typeof memberRaw !== "object") continue;
            if (!isActiveChildCustomerMemberForInquiry(memberRaw as unknown as Record<string, unknown>)) {
                continue;
            }
            const list = ocmByOpportunityId.get(link.opportunity_id) ?? [];
            list.push(memberRaw);
            ocmByOpportunityId.set(link.opportunity_id, list);
        }
    }

    for (const row of rows) {
        const opportunityId = String(row.id);
        const existing = out.get(opportunityId) ?? {};
        const customerId = trimId(row.customer_id);
        const fromCustomer = customerId ? membersByCustomerId.get(customerId) ?? [] : [];
        const fromOcm = ocmByOpportunityId.get(opportunityId) ?? [];
        const members = fromCustomer.length > 0 ? fromCustomer : fromOcm;
        if (!members.length) {
            if (Object.keys(existing).length) out.set(opportunityId, existing);
            continue;
        }

        const householdChildren = members.map((member) => ({
            id: trimId(member.id),
            customer_member_id: trimId(member.id),
            person_id: trimId(member.person_id),
            display_name: displayNameForMember(member as unknown as Record<string, unknown>),
            first_name: trimId(member.first_name),
            last_name: trimId(member.last_name),
            dob: member.dob != null ? String(member.dob).slice(0, 10) : null,
            linked_on_inquiry: false,
        }));

        const crmLines = householdChildren
            .map((child) => {
                const primary = child.display_name?.trim();
                if (!primary) return null;
                return {
                    primary,
                    secondary: null as string | null,
                    personId: child.person_id,
                    customerMemberId: child.customer_member_id,
                };
            })
            .filter((line): line is NonNullable<typeof line> => Boolean(line));

        out.set(opportunityId, {
            ...existing,
            _household_children: householdChildren,
            _crm_compact_children: existing._crm_compact_children?.length
                ? existing._crm_compact_children
                : crmLines,
            _child_display_name:
                existing._child_display_name
                ?? crmLines[0]?.primary
                ?? null,
        });
    }

    return out;
}
