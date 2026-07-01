/**
 * Client routing for canonical relationship actions (registry / top-right Actions / BOS).
 */

import { canonicalActionDefinition } from "@/lib/admin/actions/canonicalActionRegistry";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type {
    RelationshipActionExecutionRequest,
    RelationshipActionKey,
    RelationshipActionSourceSurface,
} from "@/lib/admin/relationship/relationshipActionContract";
import { isRelationshipActionKey } from "@/lib/admin/relationship/relationshipActionContract";

export const ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL = "adminv2:open-relationship-action-modal" as const;

export type OpenRelationshipActionModalDetail = {
    action_key: RelationshipActionKey;
    opportunity_id: string;
    source_surface?: RelationshipActionSourceSurface;
    initial_proposal?: Partial<RelationshipActionExecutionRequest>;
};

export function resolveRelationshipActionKeyFromResolvedAction(
    action: ResolvedActionForClient,
): RelationshipActionKey | null {
    const key = action.key.trim();
    if (isRelationshipActionKey(key)) {
        const def = canonicalActionDefinition(key);
        if (def?.executor.kind === "relationship_execute") return key;
        if (def?.executor.kind === "dedicated_modal") return null;
    }

    const payload =
        action.payload && typeof action.payload === "object" ?
            (action.payload as Record<string, unknown>)
        :   {};
    const intent = payload.intent != null ? String(payload.intent).trim() : "";
    const fromPayload = payload.relationship_action_key != null ? String(payload.relationship_action_key).trim() : "";
    if (intent === "relationship_action" && isRelationshipActionKey(fromPayload)) {
        return fromPayload;
    }

    if (action.canonical?.executor_kind === "relationship_execute" && isRelationshipActionKey(key)) {
        return key;
    }

    return null;
}

export function isCanonicalRelationshipResolvedAction(action: ResolvedActionForClient): boolean {
    return resolveRelationshipActionKeyFromResolvedAction(action) != null;
}

export function mapRegistrySurfaceToRelationshipSource(surface: string): RelationshipActionSourceSurface {
    const s = surface.trim();
    if (s === "record_header" || s === "record_section") return "opportunity_drawer";
    if (s === "queue_row" || s === "work_unit" || s === "department" || s === "right_rail") {
        return "opportunity_drawer";
    }
    return "opportunity_drawer";
}

export function dispatchOpenRelationshipActionModal(detail: OpenRelationshipActionModalDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    const actionKey = detail.action_key;
    if (!opportunityId || !isRelationshipActionKey(actionKey)) return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL, {
            detail: {
                action_key: actionKey,
                opportunity_id: opportunityId,
                source_surface: detail.source_surface ?? "opportunity_drawer",
                initial_proposal: detail.initial_proposal,
            },
        }),
    );
}

export function parseOpenRelationshipActionModalDetail(ev: Event): OpenRelationshipActionModalDetail | null {
    const ce = ev as CustomEvent<OpenRelationshipActionModalDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    const actionKey = typeof d.action_key === "string" ? d.action_key.trim() : "";
    if (!opportunityId || !isRelationshipActionKey(actionKey)) return null;
    return {
        action_key: actionKey,
        opportunity_id: opportunityId,
        source_surface: d.source_surface,
        initial_proposal: d.initial_proposal,
    };
}
