/**
 * Client routing for Change Enrollment Status action.
 */

import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type {
    EnrollmentStatusTransitionScope,
    EnrollmentStatusTransitionSourceSurface,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    ENROLLMENT_STATUS_TRANSITION_FORM_KEY,
    isEnrollmentStatusTransitionActionKey,
    isEnrollmentStatusTransitionFormKey,
    LEGACY_UPDATE_STATUS_ADD_NOTE_KEY,
    UPDATE_ENROLLMENT_STATUS_ACTION_KEY,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { mapRegistrySurfaceToEnrollmentSource } from "@/lib/admin/enrollmentStatus/resolveEnrollmentStatusTransitionScope";

export const ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL = "adminv2:open-enrollment-status-modal" as const;

export type OpenEnrollmentStatusModalDetail = {
    opportunity_id: string;
    action_key?: typeof UPDATE_ENROLLMENT_STATUS_ACTION_KEY | typeof LEGACY_UPDATE_STATUS_ADD_NOTE_KEY;
    source_surface?: EnrollmentStatusTransitionSourceSurface;
    scope?: Partial<EnrollmentStatusTransitionScope>;
};

export function resolveEnrollmentStatusActionFromResolvedAction(
    action: ResolvedActionForClient,
): boolean {
    if (isEnrollmentStatusTransitionActionKey(action.key)) return true;
    const payload =
        action.payload && typeof action.payload === "object"
            ? (action.payload as Record<string, unknown>)
            : {};
    const formKey = payload.form_key != null ? String(payload.form_key).trim() : "";
    return isEnrollmentStatusTransitionFormKey(formKey);
}

export function dispatchOpenEnrollmentStatusModal(detail: OpenEnrollmentStatusModalDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    if (!opportunityId) return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL, {
            detail: {
                opportunity_id: opportunityId,
                action_key: detail.action_key ?? UPDATE_ENROLLMENT_STATUS_ACTION_KEY,
                source_surface: detail.source_surface ?? "opportunity_drawer",
                scope: detail.scope,
            },
        }),
    );
}

export function parseOpenEnrollmentStatusModalDetail(ev: Event): OpenEnrollmentStatusModalDetail | null {
    const ce = ev as CustomEvent<OpenEnrollmentStatusModalDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    if (!opportunityId) return null;
    return {
        opportunity_id: opportunityId,
        action_key: d.action_key,
        source_surface: d.source_surface,
        scope: d.scope,
    };
}

export { ENROLLMENT_STATUS_TRANSITION_FORM_KEY, mapRegistrySurfaceToEnrollmentSource };
