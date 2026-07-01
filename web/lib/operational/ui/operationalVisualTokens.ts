/**
 * Alloy operational visual tokens (PX-1 typography/spacing · PX-2 surfaces).
 *
 * Canonical typography, spacing, and surface rhythm for Forms, BOS, queues,
 * drawers, and future workflow surfaces. Prefer importing from here (or
 * `formsReviewClassTokens` re-exports) — avoid ad hoc hex and arbitrary gaps.
 *
 * Spacing scale (px): 8 · 12 · 16 · 20 · 24
 *   Tailwind: gap/space/p 2 · 3 · 4 · 5 · 6
 *
 * Surface doctrine (PX-2): prefer ring/soft fill over stacked borders; border XOR
 * shadow on elevated bands; region bands over nested cards; one grouped container
 * per list.
 */

// ---------------------------------------------------------------------------
// Spacing rhythm
// ---------------------------------------------------------------------------

/** Between case-file / drawer regions (16px) */
export const opStackRegion = "space-y-4";

/** Between regions in compact surfaces e.g. modal (12px) */
export const opStackRegionCompact = "space-y-3";

/** Between page-level operational blocks (20px) */
export const opStackPage = "space-y-5";

/** Inside a region — sections, assist subsections (12px) */
export const opStackSection = "space-y-3";

/** Inside a region — compact assist (10px) */
export const opStackSectionCompact = "space-y-2.5";

/** Grouped list items, artifact groups (8px) */
export const opStackGroup = "space-y-2";

/** Metadata lines, checklist rows (4px) */
export const opStackMeta = "space-y-1";

/** Content block after section title + support line (12px) */
export const opSectionContentAfterLead = "mt-3";

/** Content block after section title only (8px) */
export const opSectionContentAfterTitle = "mt-2";

/** Inside grouped operational surfaces */
export const opGroupedRowPadding = "px-3 py-2.5";

/** Intelligence / assist inner stack after header */
export const opAssistBodyOffset = "mt-3";

/** Technical disclosure inner stack */
export const opDisclosureInner = "mt-3 space-y-3 border-t border-admin-border/80 pt-3";

/** Action link row below artifact body */
export const opActionRow = "mt-2 flex flex-wrap gap-x-3 gap-y-1";

/** Primary review action button row */
export const opReviewActionButtonRow = "mt-4 flex flex-wrap gap-2";

// ---------------------------------------------------------------------------
// Page / region composition (PX-2)
// ---------------------------------------------------------------------------

/** Case-file canvas — ambient ground for packet review */
export const opCaseFileCanvas = "rounded-xl bg-alloy-stone/30 p-4 sm:p-5";

export const opCaseFileCanvasCompact = "rounded-lg bg-alloy-stone/25 p-3";

/** Separator between major regions inside the canvas */
export const opRegionSeparator = "border-t border-alloy-midnight/[0.07] pt-5";

/** Region band shell — title-led block without card chrome */
export const opRegionBand = "min-w-0";

// ---------------------------------------------------------------------------
// Typography — page
// ---------------------------------------------------------------------------

export const opPageTitle = "text-xl font-semibold text-alloy-midnight tracking-tight";

export const opPageSubtitle = "text-sm text-alloy-midnight/70 max-w-prose";

/** @deprecated alias — prefer opPageSubtitle */
export const opPageLead = opPageSubtitle;

// ---------------------------------------------------------------------------
// Typography — section / region
// ---------------------------------------------------------------------------

export const opSectionTitle = "text-sm font-semibold text-alloy-midnight";

export const opSectionSupport = "mt-0.5 text-xs leading-snug text-alloy-midnight/65";

/** @deprecated alias — prefer opSectionTitle */
export const opRegionTitle = opSectionTitle;

/** @deprecated alias — prefer opSectionSupport */
export const opRegionLead = opSectionSupport;

// ---------------------------------------------------------------------------
// Typography — operational review / case file
// ---------------------------------------------------------------------------

/** Orientation band primary title (packet name, subject) */
export const opCaseFileTitle = "text-lg font-semibold text-alloy-midnight tracking-tight";

/** Under case-file title — household, opportunity */
export const opCaseFileSubtitle = "mt-1 text-sm text-alloy-midnight/70 max-w-prose";

/** Context row label e.g. "Customer:" */
export const opContextLabel = "font-medium text-alloy-midnight";

/** Context values, answer body, list content */
export const opContextValue = "text-sm leading-relaxed text-alloy-midnight/85";

/** Paired with readiness chip — same weight as section title, not headline */
export const opConfidenceTitle = opSectionTitle;

/** Timestamps, progress lines, secondary hints */
export const opMetadata = "text-xs text-alloy-midnight/60";

/** Tighter secondary metadata — provenance timing, legends */
export const opMutedMeta = "text-[11px] leading-snug text-alloy-midnight/55";

/** General body — alias for lists and paragraphs in regions */
export const opBody = opContextValue;

/** @deprecated alias — prefer opMetadata */
export const opMeta = opMetadata;

/** Group headers, checklist subheads, artifact kind */
export const opLabelCaps = "text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50";

/** Softer caps for artifact kind rows */
export const opLabelCapsSoft = "text-[11px] font-medium uppercase tracking-wide text-alloy-midnight/45";

// ---------------------------------------------------------------------------
// Typography — intelligence / BOS (same system — no “assistant” styling)
// ---------------------------------------------------------------------------

export const opInsightSummary = "text-sm leading-snug text-alloy-midnight/85";

export const opInsightSummaryCompact = "text-[13px] leading-snug text-alloy-midnight/85";

export const opInsightSupport = opSectionSupport;

export const opInsightBulletList = "mt-1 space-y-1 text-xs leading-snug text-alloy-midnight/80";

export const opAttentionText = "mt-1 text-xs leading-snug text-alloy-midnight/80";

export const opAttentionTextCompact = "mt-1 text-[11px] leading-snug text-alloy-midnight/80";

export const opInsightAuthorityNote = "text-[11px] leading-snug text-alloy-midnight/50";

export const opInsightChecklistStatus = "text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45";

// ---------------------------------------------------------------------------
// Typography — technical disclosure (collapsed; monospace only here)
// ---------------------------------------------------------------------------

export const opTechnicalSummary =
    "cursor-pointer list-none text-xs font-semibold text-alloy-midnight/70 marker:text-alloy-midnight/40 [&::-webkit-details-marker]:text-alloy-midnight/40";

export const opTechnicalBlockTitle = "text-xs font-medium text-alloy-midnight";

export const opTechnicalBlockSubtitle = "mt-1 text-[11px] leading-snug text-alloy-midnight/60";

export const opTechnicalMono =
    "mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-alloy-midnight/85";

// ---------------------------------------------------------------------------
// Surface rhythm (PX-2 — layered hierarchy, reduced box fatigue)
// ---------------------------------------------------------------------------

/** Case header — primary orientation (ring + soft lift, not heavy border stack) */
export const opOrientationSurface =
    "rounded-xl bg-white px-5 py-4 shadow-[0_1px_3px_rgba(49,57,77,0.07)] ring-1 ring-alloy-midnight/[0.08]";

/** Review decision band — anchored, intentional */
export const opReviewActionsSurface =
    "rounded-xl bg-white px-5 py-4 shadow-[0_2px_10px_rgba(49,57,77,0.06)] ring-1 ring-alloy-blue/20 border-t-2 border-t-alloy-blue/30";

/** BOS review assist — calm intelligence band */
export const opIntelligenceSurface =
    "rounded-xl bg-gradient-to-br from-white via-white to-alloy-stone/25 px-4 py-4 ring-1 ring-alloy-midnight/[0.06] border-l-[3px] border-l-alloy-blue/40";

/** Single grouped list — steps, artifacts, warnings (one outline per group) */
export const opGroupedSurface =
    "overflow-hidden rounded-xl bg-white/95 ring-1 ring-alloy-midnight/[0.07] divide-y divide-alloy-midnight/[0.06]";

/** Row inside grouped surface */
export const opGroupedRowInner = "px-4 py-3.5 text-sm";

export const opGroupedRow = `${opGroupedRowPadding} text-sm`;

/** @deprecated per-step cards — use opGroupedRowInner inside opGroupedSurface */
export const opStepCardSurface = opGroupedRowInner;

export const opDivider = "border-t border-alloy-midnight/[0.06]";

/** Attention / needs-action row inside grouped surface */
export const opAttentionRow =
    "flex flex-wrap items-center justify-between gap-2 bg-alloy-ember/[0.04] px-4 py-3 text-sm text-alloy-midnight";

/** What-changed / review hint row inside grouped surface */
export const opReviewHintRow =
    "flex flex-wrap items-start gap-2 bg-alloy-stone/15 px-4 py-3 text-sm leading-snug text-alloy-midnight/85";

/** Read-only answer embed — soft inset, no competing border */
export const opAnswerSurface = "mt-2 rounded-lg bg-alloy-stone/25 px-3 py-3 ring-1 ring-alloy-midnight/[0.05]";

/** Intake artifact row (inside grouped surface) */
export const opIntakeArtifactRow = `${opGroupedRowInner} bg-white`;

/** Technical disclosure — collapsed, low elevation */
export const opTechnicalSurface =
    "rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 ring-1 ring-alloy-midnight/[0.05]";

export const opTechnicalJsonSurface = "rounded-lg bg-white/70 p-3 ring-1 ring-alloy-midnight/[0.05]";

// ---------------------------------------------------------------------------
// Provenance (metadata hierarchy — origin primary, timing muted)
// ---------------------------------------------------------------------------

export const opProvenanceOrigin = "text-xs font-medium text-alloy-midnight/75";

export const opProvenanceMeta = opMutedMeta;

export const opProvenanceLegend = "text-[11px] leading-snug text-alloy-midnight/50";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const opActionLink =
    "text-xs font-semibold text-alloy-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-blue/40";

// ---------------------------------------------------------------------------
// Case-file section variants (CaseFileSection)
// ---------------------------------------------------------------------------

/** PX-2 default — tonal band, not bordered card */
export const opCaseFileSectionTint = {
    default: "",
    attention: "rounded-xl bg-alloy-ember/[0.05] px-4 py-3 ring-1 ring-inset ring-alloy-ember/15",
    context: "rounded-xl bg-alloy-blue/[0.04] px-4 py-3 ring-1 ring-inset ring-alloy-blue/12",
    subtle: "",
} as const;

/** Legacy card shell — `layout="card"` only */
export const opCaseFileSectionSurface = {
    default: "border-admin-border bg-white",
    attention: "border-alloy-ember/30 bg-alloy-ember/8",
    context: "border-alloy-blue/25 bg-alloy-blue/5",
    subtle: "border-admin-border bg-alloy-stone/15",
} as const;

export const opCaseFileSectionShell = "rounded-lg border px-4 py-3";
