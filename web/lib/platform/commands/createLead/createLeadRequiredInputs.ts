/**
 * Create Lead — shared read-only derivation (Operational Command Runtime V4).
 *
 * Single source of truth for the create_lead command's **read-only** runtime facts:
 * required inputs, blockers, eligibility, preview, and display name. Both the registered
 * action (`createLeadAction`) and the operator-facing command view-model
 * (`deriveCreateLeadCommandState`) consume this, so manual UI, BOS, and the server
 * executor reason about the same minimum.
 *
 * This module is **read-only**. It does NOT create records. The authoritative create_lead
 * invariant + record creation lives in `executeCreateLeadAction` and runs at execute time
 * regardless of what the client believes. Stage-configured `field_rules` add config-supplied
 * required-input hints on top of this code-owned minimum (see the audit doc for the parity
 * boundary).
 *
 * @see docs/sprints/archive/06_2026/create_lead_command_flow_audit.md
 */

import {
    eligible,
    type ActionBlocker,
    type ActionEligibility,
    type ActionPreview,
    type ActionRequiredInput,
} from "@/lib/adminV2/actions/actionTypes";
import { isCreateLeadLocationRequired } from "@/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy";

export const CREATE_LEAD_ACTION_KEY = "create_lead";

export function trimmedValue(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** Code-owned minimum required inputs (server invariant mirror). */
export const CREATE_LEAD_REQUIRED_INPUTS: readonly ActionRequiredInput[] = [
    { key: "first_name", label: "First name", type: "text", required: true },
    { key: "last_name", label: "Last name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: false, hint: "Email or phone required." },
    { key: "phone", label: "Phone", type: "phone", required: false, hint: "Email or phone required." },
    {
        key: "location_id",
        label: "Location",
        type: "select",
        required: true,
        hint: "School / site is required to create a lead.",
    },
] as const;

export function createLeadDisplayName(payload: Record<string, unknown>): string {
    const first = trimmedValue(payload.first_name);
    const last = trimmedValue(payload.last_name);
    return [first, last].filter(Boolean).join(" ").trim();
}

export function createLeadPrimaryContact(payload: Record<string, unknown>): string {
    return trimmedValue(payload.email) || trimmedValue(payload.phone);
}

/**
 * Code-owned minimum blockers (first + last + email|phone). Stage `field_rules` may add
 * more *client-side* required-input hints; the authoritative server check is
 * `executeCreateLeadAction`.
 */
export function deriveCreateLeadBlockers(payload: Record<string, unknown>): ActionBlocker[] {
    const blockers: ActionBlocker[] = [];
    if (!trimmedValue(payload.first_name)) {
        blockers.push({ code: "missing_required_input", message: "First name is required.", field: "first_name" });
    }
    if (!trimmedValue(payload.last_name)) {
        blockers.push({ code: "missing_required_input", message: "Last name is required.", field: "last_name" });
    }
    if (!trimmedValue(payload.email) && !trimmedValue(payload.phone)) {
        blockers.push({ code: "missing_required_input", message: "Phone or email is required.", field: "email" });
    }
    if (isCreateLeadLocationRequired() && !trimmedValue(payload.location_id)) {
        blockers.push({
            code: "missing_required_input",
            message: "Location is required.",
            field: "location_id",
        });
    }
    return blockers;
}

/**
 * Build read-only eligibility for create_lead from a payload field map. Optionally merge
 * config-supplied required-input hints (e.g. stage `field_rules`); hints are flagged
 * `fromConfig` and only contribute blockers when their value is absent in the payload.
 */
export function buildCreateLeadEligibility(
    payload: Record<string, unknown>,
    configRequiredInputs?: readonly ActionRequiredInput[]
): ActionEligibility {
    const requiredInputs: ActionRequiredInput[] = [...CREATE_LEAD_REQUIRED_INPUTS];
    const blockers = deriveCreateLeadBlockers(payload);

    for (const hint of configRequiredInputs ?? []) {
        if (requiredInputs.some((i) => i.key === hint.key)) continue;
        const flagged: ActionRequiredInput = { ...hint, fromConfig: true };
        requiredInputs.push(flagged);
        if (hint.required && !trimmedValue(payload[hint.key])) {
            blockers.push({
                code: "missing_required_input",
                message: `${hint.label} is required.`,
                field: hint.key,
            });
        }
    }

    return eligible({ eligible: blockers.length === 0, blockers, requiredInputs });
}

export function buildCreateLeadPreview(payload: Record<string, unknown>): ActionPreview {
    const name = createLeadDisplayName(payload) || "(unnamed)";
    const contact = createLeadPrimaryContact(payload) || "(no contact)";
    return {
        summary: `Create a new lead for ${name}.`,
        changes: [`Create household + opportunity for ${name}`, `Primary contact: ${contact}`],
        before: null,
        after: { first_name: trimmedValue(payload.first_name), last_name: trimmedValue(payload.last_name) },
    };
}
