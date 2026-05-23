/**
 * Fixed geometry for inquiry-summary right column (tasks / reminders / BOS handoff).
 * Skeleton, empty, and settled states share these boxes so first paint matches settle.
 */

export const INQUIRY_RIGHT_COLUMN_GROUP_LABEL_CLASS =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45";

/** One chip row — tasks and reminders body. */
export const INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS = "h-[1.75rem] flex flex-wrap items-center gap-1";

export const INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS = INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS;

export const INQUIRY_RIGHT_COLUMN_REMINDERS_BODY_CLASS = INQUIRY_RIGHT_COLUMN_CHIP_ROW_CLASS;

/** Label + one chip row. */
export const INQUIRY_RIGHT_COLUMN_REMINDERS_SECTION_CLASS = "h-[3.25rem] shrink-0";

/** BOS handoff block including separator (matches OrchestratorHandoffCard outer spacing). */
export const INQUIRY_RIGHT_COLUMN_HANDOFF_SLOT_CLASS =
    "mt-2 h-[7.25rem] shrink-0 border-t border-alloy-stone/10 pt-2";

export const INQUIRY_RIGHT_COLUMN_HANDOFF_CARD_INNER_CLASS =
    "flex h-full min-h-0 flex-col rounded-lg border border-alloy-blue/22 bg-gradient-to-br from-alloy-blue/[0.06] via-white to-alloy-stone/[0.03] px-2.5 py-2 shadow-[0_1px_0_rgba(39,63,82,0.04)]";

/** Empty copy aligned to chip row height (not a shorter paragraph). */
export const INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS =
    "inline-flex h-[1.75rem] items-center text-[11px] text-alloy-midnight/50";

/** Root right column — stable total reserved height for inquiry summary column. */
export const INQUIRY_SUMMARY_RIGHT_COLUMN_ROOT_CLASS =
    "mt-2 min-h-[16rem] border-t border-alloy-stone/10 pt-2";

export const INQUIRY_SUMMARY_RIGHT_COLUMN_SHELL_MIN_H_CLASS = "min-h-[16rem]";
