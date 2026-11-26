/**
 * Client routing for Change lead location Manage command.
 */

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import {
    CHANGE_LEAD_LOCATION_ACTION_KEY,
    CHANGE_LEAD_LOCATION_FORM_KEY,
    isChangeLeadLocationActionKey,
    isChangeLeadLocationFormKey,
} from "@/lib/admin/actions/changeLeadLocationContract";

export const ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL = "adminv2:open-change-lead-location-modal" as const;

export type OpenChangeLeadLocationModalDetail = {
    opportunity_id: string;
    action_key?: typeof CHANGE_LEAD_LOCATION_ACTION_KEY;
};

export function resolveChangeLeadLocationActionFromResolvedAction(
    action: ResolvedActionForClient,
): boolean {
    if (isChangeLeadLocationActionKey(action.key)) return true;
    const payload =
        action.payload && typeof action.payload === "object"
            ? (action.payload as Record<string, unknown>)
            : {};
    const formKey = payload.form_key != null ? String(payload.form_key).trim() : "";
    return isChangeLeadLocationFormKey(formKey);
}

export function dispatchOpenChangeLeadLocationModal(detail: OpenChangeLeadLocationModalDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    if (!opportunityId) return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_CHANGE_LEAD_LOCATION_MODAL, {
            detail: {
                opportunity_id: opportunityId,
                action_key: detail.action_key ?? CHANGE_LEAD_LOCATION_ACTION_KEY,
            },
        }),
    );
}

export function parseOpenChangeLeadLocationModalDetail(
    ev: Event,
): OpenChangeLeadLocationModalDetail | null {
    const ce = ev as CustomEvent<OpenChangeLeadLocationModalDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    if (!opportunityId) return null;
    return {
        opportunity_id: opportunityId,
        action_key: d.action_key,
    };
}

export { CHANGE_LEAD_LOCATION_ACTION_KEY, CHANGE_LEAD_LOCATION_FORM_KEY };
