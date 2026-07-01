"use client";

/**
 * useOcmSectionActions — resolves config-driven actions for OCM-grain record sections.
 *
 * Fetches action placements for entity_type=opportunity_customer_member on the
 * record_section surface. The result is section-scoped (shared across all child rows
 * in the section) — fetches once per mount, not per row.
 *
 * This replaces the OCM_MUTATION_COMMAND_REGISTERED hardcode in OpportunityInquiryChildrenSection.
 * When a placement exists in the DB, the action button appears. When it is removed or
 * deactivated, the button disappears — no code change required.
 */

import { useEffect, useState } from "react";
import type { ResolvedActionsBySlot, ResolvedActionForClient } from "@/lib/admin/actions/types";

export type OcmSectionAction = Pick<ResolvedActionForClient, "key" | "label" | "action_type">;

function flattenActionSlots(slots: ResolvedActionsBySlot): OcmSectionAction[] {
    const all: OcmSectionAction[] = [];
    for (const bucket of Object.values(slots)) {
        for (const a of bucket as ResolvedActionForClient[]) {
            if (!all.some((x) => x.key === a.key)) {
                all.push({ key: a.key, label: a.label, action_type: a.action_type });
            }
        }
    }
    return all;
}

/**
 * Resolves placement-driven actions for child OCM rows in a named section.
 *
 * @param sectionKey  - The section_key to filter placements (e.g. "children")
 * @param anchorOcmId - Any valid OCM id for this opportunity (used as entity_id).
 *                      For placements without status conditions, all children get the
 *                      same set — fetch once per section.
 */
export function useOcmSectionActions(
    sectionKey: string,
    anchorOcmId: string | null | undefined
): { actions: OcmSectionAction[]; loading: boolean } {
    const [actions, setActions] = useState<OcmSectionAction[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!anchorOcmId) {
            setActions([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const url = `/api/admin/actions?surface=record_section&entity_type=opportunity_customer_member&entity_id=${encodeURIComponent(anchorOcmId)}&section_key=${encodeURIComponent(sectionKey)}`;
        fetch(url)
            .then((r) => r.json())
            .then((data: unknown) => {
                if (cancelled) return;
                const slots = (data as { actions?: ResolvedActionsBySlot })?.actions;
                setActions(slots ? flattenActionSlots(slots) : []);
            })
            .catch(() => {
                if (!cancelled) setActions([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [sectionKey, anchorOcmId]);

    return { actions, loading };
}
