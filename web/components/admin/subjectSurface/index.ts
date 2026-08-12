/**
 * Subject Surface presentation barrel — canonical Focus Panel vocabulary.
 *
 * The RUNTIME entries are gone. `SubjectSurfaceRuntime` / `FocusPanelRuntime` /
 * `EnrollmentSubjectSurfaceRuntime` / `PersonSubjectSurfaceRuntime` named the modal overlay router
 * and the two runtimes it mounted; the inline Focus Panel region
 * (`components/presentation/workUnit/InlineOpportunityFocusPanel`) is the one record surface, and it
 * never went through them.
 *
 * What remains is the shell and the view-model vocabulary, which the inline panel does use.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */

export { default as FocusPanelShell } from "@/components/admin/subjectSurface/FocusPanelShell";
export type { FocusPanelShellProps } from "@/components/admin/subjectSurface/FocusPanelShell";

export type {
    OperationalSubjectViewModel,
    OperationalSubjectViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/types";
export type { SubjectComposition } from "@/lib/adminV2/runtime/focusPanel/subjectComposition";

