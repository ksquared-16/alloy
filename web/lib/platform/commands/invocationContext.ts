/**
 * Operational Command Runtime — Context Resolution + Required Subject model
 * (Actions Runtime V2, refined).
 *
 * Canonical doctrine:
 *   Every operational mutation in Alloy is an **Operational Command**.
 *   Command = registered capability + placement + context resolution + eligibility
 *           + required subjects + required inputs + preview + execution + audit + refresh.
 *
 *   - There is exactly ONE registered capability per command — see actionRegistry.ts.
 *   - There are MANY placements (where operators see it) — config-owned presentation.
 *   - Context resolution describes HOW the command's subject(s) are resolved.
 *   - There is ONE execution runtime — runRegisteredAction / resolveActionEligibility.
 *
 * Important mental-model correction: a Work Unit rail command is NOT "entityId = null".
 * It has **no inherited subject yet** and a **required subject** that must be resolved
 * (user_selection / queue_selection / suggested_record / bos_proposal). The subject is
 * never silently assumed from the highlighted row.
 *
 * @see docs/sprints/archive/06_2026/actions_runtime_audit.md
 * @see docs/platform/modules/actions-and-workflows.md
 */

import type { RegisteredAction } from "@/lib/adminV2/actions/actionTypes";

/**
 * Logical placements — operator-facing surface families, decoupled from the physical
 * `action_placements.surface`/`slot` DB enum. Configuration places a command onto a
 * logical placement; the runtime maps physical surfaces onto these.
 */
export type LogicalActionPlacement =
    | "work_unit_actions"
    | "focus_panel_manage"
    | "queue_row_menu"
    | "bos_recommendations";

export const LOGICAL_ACTION_PLACEMENTS: readonly LogicalActionPlacement[] = [
    "work_unit_actions",
    "focus_panel_manage",
    "queue_row_menu",
    "bos_recommendations",
] as const;

export function isLogicalActionPlacement(value: string): value is LogicalActionPlacement {
    return (LOGICAL_ACTION_PLACEMENTS as readonly string[]).includes(value);
}

/**
 * Map a physical `action_placements.surface` (+ optional work-unit scope) to a logical
 * placement. Keeps the DB enum stable while presenting the canonical placement model.
 */
export function logicalPlacementForPhysicalSurface(input: {
    surface: string;
    workUnitId?: string | null;
}): LogicalActionPlacement {
    const surface = (input.surface ?? "").trim();
    switch (surface) {
        case "record_header":
        case "record_section":
            return "focus_panel_manage";
        case "queue_row":
            return "queue_row_menu";
        case "bos":
        case "bos_rail":
        case "bos_recommendations":
            return "bos_recommendations";
        case "work_unit":
        case "department":
        case "workspace":
        case "right_rail":
            return "work_unit_actions";
        default:
            return "work_unit_actions";
    }
}

/**
 * How a command resolves its operating subject:
 *  - current_record    → the surface already has the subject (Focus Panel, queue row).
 *  - user_selection    → the operator must explicitly choose a subject (Work Unit rail).
 *  - queue_selection   → the subject is chosen from the active queue.
 *  - suggested_record  → a subject is proposed as a default; never authoritative.
 *  - bos_proposal      → BOS proposes the subject/payload; the operator confirms.
 *  - open              → no subject is needed (capture-first, e.g. create_lead).
 */
export type ContextResolution =
    | "current_record"
    | "user_selection"
    | "queue_selection"
    | "suggested_record"
    | "bos_proposal"
    | "open";

export const CONTEXT_RESOLUTIONS: readonly ContextResolution[] = [
    "current_record",
    "user_selection",
    "queue_selection",
    "suggested_record",
    "bos_proposal",
    "open",
] as const;

export function isContextResolution(value: string): value is ContextResolution {
    return (CONTEXT_RESOLUTIONS as readonly string[]).includes(value);
}

/** The kind of subject a command operates on. `none` = capture-first / no subject. */
export type RequiredSubject =
    | "none"
    | "opportunity"
    | "person"
    | "child"
    | "case"
    | "multiple_opportunities";

export const REQUIRED_SUBJECTS: readonly RequiredSubject[] = [
    "none",
    "opportunity",
    "person",
    "child",
    "case",
    "multiple_opportunities",
] as const;

export function isRequiredSubject(value: string): value is RequiredSubject {
    return (REQUIRED_SUBJECTS as readonly string[]).includes(value);
}

/** True when the command needs a subject to execute. */
export function actionRequiresRecord(action: RegisteredAction): boolean {
    return action.requiredContext.requiresEntityId || action.requiredContext.requiresOpportunity;
}

/** Derive the required subject for a registered command from its capability metadata. */
export function requiredSubjectForAction(action: RegisteredAction): RequiredSubject {
    if (action.requiredContext.requiresCustomer) return "person";
    if (!actionRequiresRecord(action)) return "none";
    const primary = action.supportedEntityTypes[0];
    switch (primary) {
        case "person":
        case "opportunity_customer_member":
            return "person";
        case "child":
            return "child";
        case "opportunity":
        default:
            return "opportunity";
    }
}

/**
 * Resolve the context-resolution strategy for a command at a logical placement.
 * Platform default; configuration may later override per placement (not yet persisted).
 */
export function resolveContextResolution(input: {
    placement: LogicalActionPlacement;
    requiredSubject: RequiredSubject;
}): ContextResolution {
    if (input.requiredSubject === "none") return "open";
    switch (input.placement) {
        case "focus_panel_manage":
        case "queue_row_menu":
            // The surface already carries the subject.
            return "current_record";
        case "bos_recommendations":
            return "bos_proposal";
        case "work_unit_actions":
            // Work Unit commands have no inherited subject — the operator must choose one.
            return "user_selection";
        default:
            return "user_selection";
    }
}

/**
 * The runtime decision for a command's subject:
 *  - open          → execute with no subject.
 *  - execute       → a subject is resolved; proceed.
 *  - needs_subject → the operator must resolve a subject before execution. A suggested
 *                    subject may be offered as a default but is NEVER authoritative.
 */
export type CommandSubjectResolution =
    | { mode: "open"; subjectId: null }
    | { mode: "execute"; subjectId: string }
    | {
          mode: "needs_subject";
          resolution: ContextResolution;
          requiredSubject: RequiredSubject;
          suggestedSubjectId: string | null;
      };

function trimOrNull(value: string | null | undefined): string | null {
    return (value ?? "").trim() || null;
}

/**
 * Decide how a command obtains its subject, given the context resolution, the subject
 * inherited from the surface (if any), and any suggested subject (last-opened / BOS).
 *
 * The inherited subject is authoritative only for `current_record`. For every
 * selection/proposal resolution the operator must explicitly resolve a subject — a
 * suggested subject is offered as a default, not silently executed.
 */
export function resolveCommandSubject(input: {
    contextResolution: ContextResolution;
    requiredSubject: RequiredSubject;
    /** Subject the surface already carries (Focus Panel record, queue row record). */
    inheritedSubjectId?: string | null;
    /** Subject proposed as a default (last-opened, BOS) — optional context, not authoritative. */
    suggestedSubjectId?: string | null;
}): CommandSubjectResolution {
    const inherited = trimOrNull(input.inheritedSubjectId);
    const suggested = trimOrNull(input.suggestedSubjectId);

    if (input.contextResolution === "open" || input.requiredSubject === "none") {
        return { mode: "open", subjectId: null };
    }
    if (input.contextResolution === "current_record") {
        return inherited
            ? { mode: "execute", subjectId: inherited }
            : {
                  mode: "needs_subject",
                  resolution: input.contextResolution,
                  requiredSubject: input.requiredSubject,
                  suggestedSubjectId: suggested,
              };
    }
    // user_selection / queue_selection / suggested_record / bos_proposal:
    // never silently inherit; the operator resolves the subject.
    return {
        mode: "needs_subject",
        resolution: input.contextResolution,
        requiredSubject: input.requiredSubject,
        suggestedSubjectId: suggested,
    };
}

export type ResolvedCommandContext = {
    placement: LogicalActionPlacement;
    requiredSubject: RequiredSubject;
    contextResolution: ContextResolution;
    subject: CommandSubjectResolution;
};

/**
 * Shared invocation contract: given a registered command, the physical surface it was
 * invoked from, the inherited subject (if any), and any suggested subject, return the
 * placement, required subject, context resolution, and subject decision. Every UI surface
 * (Work Unit rail, Focus Panel Manage, queue row, BOS) resolves context identically.
 */
export function resolveCommandContext(input: {
    action: RegisteredAction;
    surface: string;
    workUnitId?: string | null;
    inheritedSubjectId?: string | null;
    suggestedSubjectId?: string | null;
}): ResolvedCommandContext {
    const placement = logicalPlacementForPhysicalSurface({ surface: input.surface, workUnitId: input.workUnitId });
    const requiredSubject = requiredSubjectForAction(input.action);
    const contextResolution = resolveContextResolution({ placement, requiredSubject });
    const subject = resolveCommandSubject({
        contextResolution,
        requiredSubject,
        inheritedSubjectId: input.inheritedSubjectId,
        suggestedSubjectId: input.suggestedSubjectId,
    });
    return { placement, requiredSubject, contextResolution, subject };
}
