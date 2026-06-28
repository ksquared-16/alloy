/**
 * Operational Intent layer (Operational Command Runtime V3).
 *
 * Separate **Operational Intent** (human) from **Operational Capability** (technical).
 *
 *   Operators think:  "I need to schedule a tour" / "I need to move this family forward."
 *   They never think:  "Execute schedule_tour" / "Execute update_status."
 *
 * An intent resolves to one or more registered capabilities (action keys). One intent may
 * eventually fan out into several capabilities (e.g. Enroll Child → assign_room +
 * create_contract + generate_documents + …). The runtime never exposes capability/
 * implementation detail to operators — intent is the operator-facing noun.
 *
 * This module is the operator-facing vocabulary; it does not execute. Execution still
 * flows through the one runtime (actionExecutor.ts) via the resolved capability.
 *
 * @see docs/sprints/06_2026/operational_command_runtime_v3.md
 * @see docs/platform/modules/actions-and-workflows.md § Operational Command Runtime
 */

import type { RequiredSubject } from "@/lib/adminV2/actions/invocationContext";
import { isKnownActionKey } from "@/lib/adminV2/actions/actionRegistry";

/**
 * `current`  — the runtime executes this intent today (validation set).
 * `planned`  — modeled to validate the runtime; not implemented (no special cases allowed).
 */
export type IntentMaturity = "current" | "planned";

export type OperationalIntent = {
    intentKey: string;
    /** Operator-facing title (the verb phrase an operator thinks in). */
    title: string;
    description: string;
    /** Capability invoked by default when the intent is chosen. */
    defaultCapability: string;
    /** All capabilities this intent may resolve into (single today; may fan out later). */
    supportedCapabilities: readonly string[];
    /** Subject types the intent can operate on (`none` = capture-first). */
    supportedSubjects: readonly RequiredSubject[];
    /** Business processes the intent applies to (empty = all). */
    supportedProcesses: readonly string[];
    maturity: IntentMaturity;
};

const INTENTS: readonly OperationalIntent[] = [
    {
        intentKey: "create_lead",
        title: "Create Lead",
        description: "Capture a new family and start them in a process.",
        defaultCapability: "create_lead",
        supportedCapabilities: ["create_lead"],
        supportedSubjects: ["none"],
        supportedProcesses: ["enrollment"],
        maturity: "current",
    },
    {
        intentKey: "move_forward",
        title: "Move Forward",
        description: "Advance a family to the next stage of their process.",
        defaultCapability: "update_status",
        supportedCapabilities: ["update_status"],
        supportedSubjects: ["opportunity"],
        supportedProcesses: [],
        maturity: "current",
    },
    {
        intentKey: "update_status",
        title: "Update Status",
        description: "Change the current status to an allowed next state.",
        defaultCapability: "update_status",
        supportedCapabilities: ["update_status"],
        supportedSubjects: ["opportunity"],
        supportedProcesses: [],
        maturity: "current",
    },
    {
        intentKey: "schedule_tour",
        title: "Schedule Tour",
        description: "Book a tour for a family.",
        defaultCapability: "schedule_tour",
        supportedCapabilities: ["schedule_tour"],
        supportedSubjects: ["opportunity"],
        supportedProcesses: ["enrollment"],
        maturity: "current",
    },
    {
        intentKey: "confirm_tour",
        title: "Confirm Tour",
        description: "Confirm an active tour booking.",
        defaultCapability: "confirm_tour",
        supportedCapabilities: ["confirm_tour"],
        supportedSubjects: ["opportunity"],
        supportedProcesses: ["enrollment"],
        maturity: "current",
    },
    {
        intentKey: "send_message",
        title: "Send Message",
        description: "Send a message to a family or person.",
        defaultCapability: "send_message",
        supportedCapabilities: ["send_message"],
        supportedSubjects: ["opportunity", "person"],
        supportedProcesses: [],
        maturity: "current",
    },
    {
        intentKey: "generate_document",
        title: "Generate Document",
        description: "Generate a document for a record.",
        defaultCapability: "generate_document",
        supportedCapabilities: ["generate_document"],
        supportedSubjects: ["opportunity", "child", "case"],
        supportedProcesses: [],
        maturity: "current",
    },

    // ── Planned intents — modeled to validate the runtime, not implemented ──
    {
        intentKey: "enroll_child",
        title: "Enroll Child",
        description: "Complete enrollment for a child — may fan out into several capabilities.",
        defaultCapability: "enroll_child",
        supportedCapabilities: [
            "assign_room",
            "assign_program",
            "create_contract",
            "generate_documents",
            "instantiate_work",
            "send_family_packet",
        ],
        supportedSubjects: ["child", "case"],
        supportedProcesses: ["enrollment"],
        maturity: "planned",
    },
    {
        intentKey: "assign_room",
        title: "Assign Room",
        description: "Assign a child to a room effective a date.",
        defaultCapability: "assign_room",
        supportedCapabilities: ["assign_room"],
        supportedSubjects: ["child"],
        supportedProcesses: ["enrollment"],
        maturity: "planned",
    },
    {
        intentKey: "withdraw_child",
        title: "Withdraw Child",
        description: "Withdraw a child from enrollment.",
        defaultCapability: "withdraw_child",
        supportedCapabilities: ["withdraw_child"],
        supportedSubjects: ["child", "case"],
        supportedProcesses: ["enrollment"],
        maturity: "planned",
    },
    {
        intentKey: "generate_invoice",
        title: "Generate Invoice",
        description: "Generate an invoice for a billing period.",
        defaultCapability: "generate_invoice",
        supportedCapabilities: ["generate_invoice"],
        supportedSubjects: ["case"],
        supportedProcesses: ["billing"],
        maturity: "planned",
    },
    {
        intentKey: "record_payment",
        title: "Record Payment",
        description: "Record a payment against an enrollment.",
        defaultCapability: "record_payment",
        supportedCapabilities: ["record_payment"],
        supportedSubjects: ["case"],
        supportedProcesses: ["billing"],
        maturity: "planned",
    },
];

const INTENT_BY_KEY: ReadonlyMap<string, OperationalIntent> = new Map(INTENTS.map((i) => [i.intentKey, i]));

export function listOperationalIntents(): readonly OperationalIntent[] {
    return INTENTS;
}

export function getOperationalIntent(intentKey: string): OperationalIntent | null {
    return INTENT_BY_KEY.get((intentKey ?? "").trim()) ?? null;
}

/** Resolve the capability an intent invokes by default. */
export function resolveIntentDefaultCapability(intentKey: string): string | null {
    return getOperationalIntent(intentKey)?.defaultCapability ?? null;
}

/** All intents whose capabilities include the given action key (reverse lookup). */
export function intentsForCapability(actionKey: string): readonly OperationalIntent[] {
    const key = (actionKey ?? "").trim();
    return INTENTS.filter((i) => i.supportedCapabilities.includes(key) || i.defaultCapability === key);
}

/**
 * Whether the intent's default capability is executable by the runtime today (registered
 * handler or known catalog capability). `planned` intents are intentionally not executable.
 */
export function isIntentExecutable(intentKey: string): boolean {
    const intent = getOperationalIntent(intentKey);
    if (!intent) return false;
    return isKnownActionKey(intent.defaultCapability);
}
