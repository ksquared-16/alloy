/**
 * Subject Surface presentation barrel — canonical Focus Panel vocabulary.
 *
 * Phase C of the Focus Panel Architecture Cutover. New presentation code should import from here
 * rather than from `@/components/admin/vmDrawer/*`. Every export is a compatibility shim that
 * resolves to the existing implementation — no payload, reveal, cache, or route behavior changes.
 *
 * @see docs/platform/operator/focus-panel-architecture-vocabulary.md (Phase C)
 */

export { default as EnrollmentSubjectSurfaceRuntime } from "@/components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime";
export { default as PersonSubjectSurfaceRuntime } from "@/components/admin/subjectSurface/PersonSubjectSurfaceRuntime";
export { default as SubjectSurfaceRuntime } from "@/components/admin/subjectSurface/SubjectSurfaceRuntime";
/** Focus Panel runtime entry — alias of the subject surface runtime router. */
export { default as FocusPanelRuntime } from "@/components/admin/subjectSurface/SubjectSurfaceRuntime";
export { default as FocusPanelShell } from "@/components/admin/subjectSurface/FocusPanelShell";
export type { FocusPanelShellProps } from "@/components/admin/subjectSurface/FocusPanelShell";

export type {
    OperationalSubjectViewModel,
    OperationalSubjectViewModelResult,
} from "@/lib/adminV2/viewModel/drawer/types";
export type { SubjectComposition } from "@/lib/adminV2/runtime/focusPanel/subjectComposition";

/** @deprecated Use `EnrollmentSubjectSurfaceRuntime`. */
export { default as OpportunityDrawerVmRuntime } from "@/components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime";
/** @deprecated Use `PersonSubjectSurfaceRuntime`. */
export { default as PersonsDrawerVmRuntime } from "@/components/admin/subjectSurface/PersonSubjectSurfaceRuntime";
