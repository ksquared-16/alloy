/**
 * Create Lead — shared read-only derivation (Operational Command Runtime V4).
 *
 * Single source of truth for the create_lead command's **read-only** runtime facts:
 * required inputs, blockers, eligibility, preview, and display name. Both the registered
 * action (`createLeadAction`) and the operator-facing command view-model
 * (`deriveCreateLeadCommandState`) consume this, so manual UI, BOS, and the server
 * executor reason about the same minimum.
 *
 * Authoritative Create Lead requirements =
 *   code-owned minimum (first + last + email|phone)
 *   + explicit effective `record_creation` fields from ActionIntakeSpec
 *
 * Location is **not** a universal platform minimum. It blocks only when present on the
 * resolved intake spec as required (`record_creation`).
 *
 * This module is **read-only**. It does NOT create records. The authoritative create_lead
 * mutation lives in `executeCreateLeadAction` / registered execute; eligibility is gated by
 * `runRegisteredAction` → `resolveEligibility` before execute.
 */

import {
    eligible,
    type ActionBlocker,
    type ActionEligibility,
    type ActionPreview,
    type ActionRequiredInput,
    type ActionRequiredInputType,
} from "@/lib/adminV2/actions/actionTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

export const CREATE_LEAD_ACTION_KEY = "create_lead";

/** Code-owned minimum payload keys (name). Contact is email|phone (see blockers). */
export const CREATE_LEAD_CODE_OWNED_REQUIRED_KEYS = ["first_name", "last_name"] as const;

export function trimmedValue(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** Code-owned minimum required inputs (server invariant mirror). No Location. */
export const CREATE_LEAD_REQUIRED_INPUTS: readonly ActionRequiredInput[] = [
    { key: "first_name", label: "First name", type: "text", required: true },
    { key: "last_name", label: "Last name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: false, hint: "Email or phone required." },
    { key: "phone", label: "Phone", type: "phone", required: false, hint: "Email or phone required." },
] as const;

export function createLeadDisplayName(payload: Record<string, unknown>): string {
    const first = trimmedValue(payload.first_name);
    const last = trimmedValue(payload.last_name);
    return [first, last].filter(Boolean).join(" ").trim();
}

export function createLeadPrimaryContact(payload: Record<string, unknown>): string {
    return trimmedValue(payload.email) || trimmedValue(payload.phone);
}

function toRequiredInputType(kind: string): ActionRequiredInputType {
    if (kind === "email" || kind === "phone" || kind === "date" || kind === "select") return kind;
    return "text";
}

/**
 * Map ActionIntakeSpec.required (already filtered to explicit record_creation + platform
 * name floor by resolveCreateLeadActionIntakeSpec) into eligibility config hints.
 * Skips code-owned name keys so the floor is not double-labeled as fromConfig.
 */
export function createLeadConfigRequiredInputsFromIntakeSpec(
    spec: ActionIntakeSpec | null | undefined
): ActionRequiredInput[] {
    if (!spec) return [];
    const codeOwned = new Set<string>(CREATE_LEAD_CODE_OWNED_REQUIRED_KEYS);
    const out: ActionRequiredInput[] = [];
    const seen = new Set<string>();
    for (const field of spec.required) {
        const key = field.payload_key?.trim();
        if (!key || codeOwned.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push({
            key,
            label: field.field_label || key.replace(/_/g, " "),
            type: toRequiredInputType(field.value_kind),
            required: true,
            fromConfig: true,
        });
    }
    return out;
}

/**
 * Code-owned minimum blockers (first + last + email|phone).
 * Config `record_creation` blockers are added by {@link buildCreateLeadEligibility}.
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
    return blockers;
}

/**
 * Build read-only eligibility for create_lead from a payload field map. Merge
 * config-supplied required-input hints from the resolved intake spec (`record_creation`).
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
