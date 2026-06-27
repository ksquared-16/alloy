/**
 * Operational Context adapter.
 *
 * The ONLY sanctioned bridge from the existing composed subject payload to the
 * forward-facing `OperationalContext` boundary. This is a thin seam, not a
 * refactor: the composed `OperationalSubjectViewModel` (internally still the
 * opportunity drawer VM during migration) stays as-is; this adapter projects the
 * fields cards are allowed to depend on.
 *
 *   Existing composed VM payload
 *     → buildOperationalContext (this file)
 *       → Focus Panel
 *         → Cards
 *
 * New card code must consume `OperationalContext`, never the drawer VM directly.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 */

import type { OperationalSubjectViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type {
    OperationalContext,
    OperationalContextStatus,
} from "@/lib/adminV2/runtime/operationalContext/types";

export type BuildOperationalContextInput = {
    subjectId: string;
    /** Operator-facing subject label (record/household title). */
    title: string;
    /** Composed subject ViewModel (internal payload; not exposed to cards). */
    subjectVm: OperationalSubjectViewModel;
    /** Composed, observed subject truth (above-fold record). */
    truth: Record<string, unknown>;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
    canMutate: boolean;
    /** Optional overrides; default `ready` (cards mount only when ready). */
    status?: OperationalContextStatus;
    maskedChannels?: boolean;
};

/**
 * Project the composed subject payload into an `OperationalContext`. Pure; safe
 * inside `useMemo`. Performs no I/O — `truth` is already composed upstream.
 */
export function buildOperationalContext(input: BuildOperationalContextInput): OperationalContext {
    const { subjectVm, truth, perspective, statusLabel, canMutate } = input;

    const stageContext = subjectVm.workspace.stage_context;
    const lifecycleRail = subjectVm.workspace.lifecycle_rail;

    return {
        subject: {
            type: subjectVm.entity.type,
            id: input.subjectId,
            label: input.title,
        },
        businessProcess: {
            key: stageContext?.stage_key ?? null,
            label: stageContext?.stage_label ?? statusLabel ?? null,
            stageKey: lifecycleRail?.current_stage_key ?? stageContext?.stage_key ?? null,
        },
        perspective: perspective
            ? { missionLabel: perspective.defaultMission ?? perspective.label ?? null }
            : null,
        truth,
        capabilities: {
            canMutate,
            maskedChannels: input.maskedChannels ?? false,
        },
        status: input.status ?? "ready",
    };
}
