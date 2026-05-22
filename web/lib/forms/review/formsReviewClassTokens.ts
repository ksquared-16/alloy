/**
 * Shared Tailwind class bundles for Forms/Documents operational surfaces.
 * Use these tokens in review components — avoid ad hoc hex borders in new UX work.
 */

/** Vertical rhythm between case-file regions */
export const formsCaseFileStack = "space-y-4";
export const formsCaseFileStackCompact = "space-y-3";

/** Case header (orientation band) */
export const formsCaseFileHeaderSurface =
    "rounded-lg border border-admin-border bg-white px-4 py-4 shadow-sm";

export const formsCaseFileHeaderTitle = "text-lg font-semibold text-alloy-midnight";

export const formsCaseFileHeaderSubtitle = "mt-1 text-sm text-alloy-midnight/70";

/** Review actions band — visually anchored before technical */
export const formsCaseFileReviewActionsSurface =
    "rounded-lg border border-alloy-blue/25 bg-alloy-blue/[0.03] px-4 py-4 shadow-sm";

/** Submitted step card — lighter than nested gray stacks */
export const formsCaseFileStepCard = "rounded-lg border border-admin-border/80 bg-white px-3 py-3";

/** Region title (Submitted forms, Documents & records, …) */
export const formsCaseFileRegionTitle = "text-sm font-semibold text-alloy-midnight";

/** Optional one-line support copy under a region title */
export const formsCaseFileRegionDescription = "mt-0.5 text-xs leading-snug text-alloy-midnight/65";

/** Body copy inside a region */
export const formsCaseFileBodyText = "text-sm leading-relaxed text-alloy-midnight/85";

/** Muted meta (timestamps, secondary hints) */
export const formsCaseFileMetaText = "text-xs text-alloy-midnight/60";

/** Inline operator links */
export const formsCaseFileActionLink =
    "text-xs font-semibold text-alloy-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-blue/40";

/** Grouped content surface inside a region */
export const formsCaseFileGroupedSurface =
    "rounded-lg border border-admin-border bg-white divide-y divide-admin-border";

/** Single item row inside grouped surface */
export const formsCaseFileGroupedRow = "px-3 py-2.5 text-sm";

/** Divider between major blocks inside a region */
export const formsCaseFileDivider = "border-t border-admin-border";

/** Intake artifact card — calm archival row inside grouped surface */
export const formsIntakeArtifactCard =
    "px-3 py-3 text-sm bg-white first:rounded-t-lg last:rounded-b-lg";

/** Artifact kind label (text, not badge) */
export const formsIntakeArtifactKindLabel = "text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/45";

/** Provenance origin line */
export const formsIntakeProvenanceOrigin = "text-xs font-medium text-alloy-midnight/75";

/** Provenance timing / secondary */
export const formsIntakeProvenanceMeta = "text-[11px] leading-snug text-alloy-midnight/55";

/** Group legend under artifact groups */
export const formsIntakeArtifactLegend = "text-[11px] leading-snug text-alloy-midnight/50";

/** Read-only answer embed container */
export const formsCaseFileAnswerSurface = "rounded-lg border border-admin-border bg-alloy-stone/15 p-3";
