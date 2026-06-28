/**
 * Command Surface — operator-facing presentation contract (Command Surface V2).
 *
 * Pure, platform-owned helpers that turn a {@link CommandSurfaceState} into the small set of
 * operator-facing strings the shell renders. This is the UX contract: stage caption, primary/
 * secondary action copy, and guards ensuring nothing technical (action keys, payload keys,
 * runtime enums) ever reaches the operator.
 *
 * No execution, no React — just copy derivation so it is unit-testable without a DOM.
 *
 * @see docs/sprints/06_2026/command_surface_v2.md
 */

import type {
    CommandSurfaceSection,
    CommandSurfaceState,
} from "@/lib/adminV2/actions/surface/commandSurfaceTypes";

/** Short caption describing where the operator is in the flow, e.g. "Step 2 of 4 · Review". */
export function commandSurfaceStageCaption(state: CommandSurfaceState): string {
    const stage = state.header.stage;
    if (!stage) return "";
    if (state.section === "success") return stage.label;
    return `Step ${stage.index} of ${stage.total} · ${stage.label}`;
}

/** A one-line operator status describing the current section (never technical). */
export function commandSurfaceSectionCaption(section: CommandSurfaceSection): string {
    switch (section) {
        case "subject_selector":
            return "Choose who this affects";
        case "input_fields":
            return "Add the required information";
        case "blocker":
            return "This command can't run yet";
        case "preview":
            return "Review what will happen";
        case "confirmation":
            return "Review and confirm";
        case "executing":
            return "Working…";
        case "success":
            return "Done";
        case "failure":
            return "Something needs your attention";
        default:
            return "";
    }
}

/** True when the primary footer action should be presented as the command's confirm action. */
export function isConfirmAction(state: CommandSurfaceState): boolean {
    return state.footer.primary.kind === "execute";
}

/**
 * Guard used by tests and the shell: an operator-facing string must not leak technical tokens
 * (snake_case payload keys, known runtime enums). Returns true when the string is safe.
 */
export function isOperatorSafeCopy(value: string | null | undefined): boolean {
    const v = (value ?? "").trim();
    if (!v) return true;
    // snake_case payload-key leak (e.g. "first_name", "status_key").
    if (/\b[a-z]+(?:_[a-z]+)+\b/.test(v)) return false;
    // raw runtime/state enum leak.
    if (/\b(action_key|entity_id|create_lead|update_status|needs_required_input|disabled_blocked)\b/.test(v)) {
        return false;
    }
    return true;
}

/** All operator-facing strings the shell will render, for a single safety sweep in tests. */
export function operatorFacingStrings(state: CommandSurfaceState): string[] {
    const out: string[] = [
        state.header.title,
        state.header.description,
        ...state.header.contextChips,
        state.footer.primary.label,
        state.body.missingSubject ?? "",
        state.body.blockerCopy ?? "",
        ...state.body.missingInputs.map((i) => i.label),
        ...(state.body.confirmationSummary ?? []),
        state.success?.message ?? "",
        state.success?.nextCopy ?? "",
        state.failure?.message ?? "",
        state.failure?.recovery ?? "",
    ];
    if (state.footer.secondary) out.push(state.footer.secondary.label);
    return out.filter(Boolean);
}
