import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { RequirementValidationResult } from "@/lib/completion/requirementValidationTypes";

export const ADMINV2_ACTION_PREFLIGHT_BLOCKED = "adminv2:action-preflight-blocked" as const;

export type ActionPreflightBlockedDetail = {
    action_key: string;
    opportunity_id: string;
    error?: string;
    completion_requirements?: RequirementValidationResult;
    action_preflight?: ActionPreflightUiPayload;
};

export function dispatchActionPreflightBlocked(detail: ActionPreflightBlockedDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_ACTION_PREFLIGHT_BLOCKED, { detail }));
}

export function parseActionPreflightBlockedDetail(ev: Event): ActionPreflightBlockedDetail | null {
    const ce = ev as CustomEvent<ActionPreflightBlockedDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    const actionKey = typeof d.action_key === "string" ? d.action_key.trim() : "";
    if (!opportunityId || !actionKey) return null;
    return d;
}
