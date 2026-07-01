/**
 * Platform presentation typography — six-tier hierarchy.
 *
 * Doctrine: `docs/system/typography-and-presentation-doctrine.md`
 *
 * Admins configure semantic roles in layout builder; the system owns size, weight,
 * color, and opacity. Import these tokens instead of ad hoc text-* classes on
 * drawer, queue, and summary surfaces.
 */

/** Tier 1 — Record titles (Lead — Hayes, Chris Hayes, Harper Hayes). */
export const PRESENTATION_RECORD_TITLE =
    "break-words text-[1.25rem] font-semibold leading-[1.12] tracking-tight text-alloy-midnight sm:text-[1.3rem]";

/** Tier 1 compact — queue row / card record title. */
export const PRESENTATION_RECORD_TITLE_COMPACT =
    "text-[14px] font-bold leading-[1.2] text-alloy-midnight";

/** Tier 2 — Section headers (Household, Enrollment, Family). */
export const PRESENTATION_SECTION_HEADER =
    "text-[13px] font-semibold tracking-tight text-alloy-midnight";

/** Tier 2 eyebrow — uppercase section band in panel chrome. */
export const PRESENTATION_SECTION_EYEBROW =
    "text-[11px] font-semibold uppercase tracking-[0.07em] text-alloy-midnight/55";

/** Tier 2 legacy body-section uppercase (settings-preview sections). */
export const PRESENTATION_BODY_SECTION_HEADER =
    "text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/52";

/** Tier 3 — Data values (names, locations, statuses as plain text). */
export const PRESENTATION_DATA_VALUE = "text-sm font-medium leading-snug text-alloy-midnight/92";

/** Tier 3 compact — card-list primary name / linked value. */
export const PRESENTATION_DATA_VALUE_COMPACT =
    "text-[13px] font-semibold leading-snug text-alloy-midnight";

/** Tier 3 repeater / grid cell value. */
export const PRESENTATION_DATA_VALUE_GRID = "text-sm font-medium leading-snug text-alloy-midnight/90";

/** Tier 4 — Field labels (LOCATION, EMAIL, STATUS, DOB). Values must visually win. */
export const PRESENTATION_LABEL =
    "text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/46";

/** Tier 4 inline queue label prefix (`Created`, `Tour`). */
export const PRESENTATION_LABEL_INLINE =
    "text-[11px] font-medium text-alloy-midnight/50";

/** Tier 5 — Supporting text (2 adults • 2 siblings, Managed on Family Lead). */
export const PRESENTATION_SUPPORTING = "text-[11px] leading-snug text-alloy-midnight/52";

/** Tier 5 metadata / contact channel secondary line. */
export const PRESENTATION_SUPPORTING_COMPACT = "text-[10px] leading-snug text-alloy-midnight/44";

/** Tier 6 — Empty states (No documents yet, No recent activity). */
export const PRESENTATION_EMPTY_STATE = "text-[12px] leading-snug text-alloy-midnight/40";

/** Tier 6 dashed empty panel copy. */
export const PRESENTATION_EMPTY_STATE_SOFT = "text-[11px] text-alloy-midnight/38";

export type PresentationTypographyTier =
    | "recordTitle"
    | "sectionHeader"
    | "dataValue"
    | "label"
    | "supporting"
    | "emptyState";

const TIER_CLASS: Record<PresentationTypographyTier, string> = {
    recordTitle: PRESENTATION_RECORD_TITLE_COMPACT,
    sectionHeader: PRESENTATION_SECTION_HEADER,
    dataValue: PRESENTATION_DATA_VALUE,
    label: PRESENTATION_LABEL,
    supporting: PRESENTATION_SUPPORTING,
    emptyState: PRESENTATION_EMPTY_STATE,
};

export function presentationTierClass(tier: PresentationTypographyTier): string {
    return TIER_CLASS[tier];
}

/** Placeholder dash when a configured value is absent — tier 6 tone, not tier 3. */
export const PRESENTATION_VALUE_PLACEHOLDER = "text-alloy-midnight/36";
