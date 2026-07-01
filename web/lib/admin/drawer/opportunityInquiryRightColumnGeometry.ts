/**
 * Inquiry-summary layout tokens — content-driven heights (no blank reserve bands).
 * Skeleton rows may use small min-heights; settled UI shrinks to content.
 */

export const INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45";

/** One chip row — tasks and reminders body. */
export const INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS = "min-h-[1.75rem] flex flex-wrap items-center gap-1";

export const INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS = INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS;

export const INQUIRY_RIGHT_COLUMN_REMINDERS_BODY_CLASS = INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS;

/** Label + one chip row — no fixed outer height. */
export const INQUIRY_RIGHT_COLUMN_REMINDERS_SECTION_CLASS = "shrink-0";

/** BOS / orchestrator handoff — content height only. */
export const INQUIRY_RIGHT_COLUMN_HANDOFF_SLOT_CLASS =
    "mt-1.5 shrink-0 border-t border-alloy-stone/10 pt-1.5";

export const INQUIRY_RIGHT_COLUMN_HANDOFF_CARD_INNER_CLASS =
    "flex min-h-0 flex-col rounded-lg border border-alloy-blue/22 bg-gradient-to-br from-alloy-blue/[0.06] via-white to-white px-2.5 py-2 shadow-[0_1px_0_rgba(39,63,82,0.04)]";

/** Empty copy aligned to chip row height. */
export const INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS =
    "inline-flex min-h-[1.75rem] items-center text-[11px] text-alloy-midnight/50";

/** Summary Family & contacts — shrink to content. */
export const INQUIRY_FAMILY_CONTACTS_SUMMARY_ROOT_CLASS =
    "min-w-0 flex flex-col space-y-0.5";

/** One reserved additional-contact row in summary variant (skeleton only). */
export const INQUIRY_FAMILY_CONTACTS_ADDITIONAL_ROW_RESERVE_CLASS = "min-h-[2rem]";

/** Primary person card slot in summary variant — no blank reserve when loaded. */
export const INQUIRY_FAMILY_CONTACTS_PRIMARY_SLOT_CLASS = "min-h-0";

/** Root right column — content-driven; separator only. */
export const INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS =
    "mt-0.5 shrink-0 space-y-1.5 border-t border-alloy-stone/10 pt-1";

/** @deprecated Use content-driven layout; kept for import stability. */
export const INQUIRY_SUMMARY_RIGHT_COLUMN_SHELL_MIN_H_CLASS = "";
