/**
 * WorkUnitSurfaceViewModel — client adapter over the existing work-unit operational bootstrap +
 * queue/lane reveal + default operational subject seed + work-unit session cache. Owns the single
 * above-fold commit for `/workspace/work-unit/:slug`; components present its sections.
 *
 * `reveal.canCommit` is the authoritative `resolveWorkUnitPageContentReady(...)` result — this
 * adapter does not introduce a second gate. The blocking bundle (WU-01 header, WU-03 pills, WU-04
 * queue header, WU-05 condensed queue / stable preparing-empty, WU-07 Focus Panel SHELL SEED when a
 * subject is selected, WU-08 mode control seed) and the snapshot/non-blocking sections (WU-02 KPI,
 * WU-12/13 right rail, WU-14 BOS rail) mirror `alloySectionMap`.
 *
 * Scope boundary: this seeds only the Focus Panel shell subject/mode (WU-07/WU-08). Focus Panel
 * CARD composition (WU-09/10/11, System 5) is explicitly out of scope and patches after commit
 * inside the already-seeded shell.
 */

import {
    composeSurfaceReveal,
    resolveSurfaceSource,
    type SurfaceViewModel,
} from "@/lib/adminV2/runtime/surface/surfaceViewModel";

export type WorkUnitQueueState = "rows" | "empty" | "preparing";

export type WorkUnitSurfaceSections = {
    /** WU-01 */
    contextHeader: { title: string | null; departmentTitle: string | null };
    /** WU-02 — snapshot/default slot (values patch after commit) */
    kpi: { hasSnapshot: boolean };
    /** WU-03 */
    workViewPills: { count: number };
    /** WU-04 */
    queueHeader: { available: boolean };
    /** WU-05 — condensed rows or stable empty/preparing state (never full-width legacy rows) */
    queue: { state: WorkUnitQueueState; rowCount: number };
    /** Default operational subject seed (drives WU-07 shell subject). */
    operationalSubjectSeed: { subjectId: string | null };
    /** WU-07 — Focus Panel SHELL seed only (subject/header placeholder); cards load after commit. */
    focusPanelShellSeed: { seeded: boolean; subjectId: string | null };
    /** WU-08 — mode control seed only. */
    modeControlSeed: { activeMode: string | null };
    /** WU-12 / WU-13 — right rail shell metadata if available (non-blocking). */
    rightRail: { available: boolean };
    /** WU-14 — BOS rail shell metadata if available (non-blocking). */
    bosRail: { available: boolean };
};

export type WorkUnitSurfaceViewModel = SurfaceViewModel<WorkUnitSurfaceSections>;

const WORK_UNIT_SURFACE_VM_VERSION = 1;

/** Sections whose values/contents may change in place after the surface commits. */
export const WORK_UNIT_PATCH_AFTER_COMMIT = [
    "WU-02", // KPI values
    "WU-09", // Focus Panel Summary cards (System 5 — separate sprint)
    "WU-10", // Focus Panel Work mode (inactive until selected)
    "WU-11", // Focus Panel Activity mode (inactive until selected)
    "WU-12", // right rail actions
    "WU-13", // right rail workflow telemetry
    "WU-14", // BOS rail
] as const;

export type ComposeWorkUnitSurfaceInput = {
    /** Authoritative existing reveal predicate (`resolveWorkUnitPageContentReady`). */
    pageContentReady: boolean;
    title: string | null;
    departmentTitle: string | null;
    kpiSnapshotAvailable: boolean;
    workViewPillCount: number;
    queueHeaderAvailable: boolean;
    queueState: WorkUnitQueueState;
    queueRowCount: number;
    operationalSubjectId: string | null;
    focusPanelShellSeeded: boolean;
    focusPanelSubjectId: string | null;
    modeControlActiveMode: string | null;
    rightRailAvailable: boolean;
    bosRailAvailable: boolean;
    /** Work-unit page seeded from session cache (`workUnitPageSeededFromCache`). */
    warmFromSession: boolean;
    /** Operational bootstrap satisfied the commit (cold-but-bootstrapped). */
    warmFromBootstrap: boolean;
};

export function composeWorkUnitSurfaceViewModel(
    input: ComposeWorkUnitSurfaceInput,
): WorkUnitSurfaceViewModel {
    const { source, warm } = resolveSurfaceSource({
        seededFromSession: input.warmFromSession,
        seededFromBootstrap: input.warmFromBootstrap,
        network: !input.warmFromSession && !input.warmFromBootstrap,
    });

    // WU-07 only joins the blocking bundle when a subject is actually selected (a subjectless lane
    // commits without a Focus Panel). The page gate (`operational_surface_ready`) already enforces
    // that the shell is coherent before commit on the cold path; this records bundle membership.
    const subjectSelected = input.operationalSubjectId != null || input.focusPanelSubjectId != null;

    const reveal = composeSurfaceReveal({
        canCommit: input.pageContentReady,
        sections: [
            { id: "WU-01", blocking: true },
            { id: "WU-02", blocking: false },
            { id: "WU-03", blocking: true },
            { id: "WU-04", blocking: true },
            { id: "WU-05", blocking: true },
            { id: "WU-07", blocking: subjectSelected },
            { id: "WU-08", blocking: true },
            { id: "WU-12", blocking: false },
            { id: "WU-13", blocking: false },
            { id: "WU-14", blocking: false },
        ],
    });

    return {
        id: "surface:work_unit",
        surface: "work_unit",
        version: WORK_UNIT_SURFACE_VM_VERSION,
        ready: input.pageContentReady,
        warm,
        source,
        sections: {
            contextHeader: { title: input.title, departmentTitle: input.departmentTitle },
            kpi: { hasSnapshot: input.kpiSnapshotAvailable },
            workViewPills: { count: input.workViewPillCount },
            queueHeader: { available: input.queueHeaderAvailable },
            queue: { state: input.queueState, rowCount: input.queueRowCount },
            operationalSubjectSeed: { subjectId: input.operationalSubjectId },
            focusPanelShellSeed: {
                seeded: input.focusPanelShellSeeded,
                subjectId: input.focusPanelSubjectId,
            },
            modeControlSeed: { activeMode: input.modeControlActiveMode },
            rightRail: { available: input.rightRailAvailable },
            bosRail: { available: input.bosRailAvailable },
        },
        reveal,
        patch: { allowedAfterCommit: [...WORK_UNIT_PATCH_AFTER_COMMIT] },
    };
}
