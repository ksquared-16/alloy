/**
 * Typography + surface tokens for the opportunity inquiry workflow drawer
 * (Inquiry summary, Family & contacts, What matters now, Communication / Notes).
 * Import these instead of ad-hoc text-* classes so panels stay visually aligned.
 */

/** Section eyebrow / small field label (upper band of each panel) */
export const oppInqEyebrow = "mb-0.5 text-[8px] font-semibold tracking-[0.12em] text-alloy-midnight/45";

/** Person / household name (plain, not a link) */
export const oppInqDisplayName = "text-[13px] font-semibold leading-snug text-alloy-midnight/90";

/** Person name as primary control (link) */
export const oppInqNameLink =
    "text-left text-[13px] font-semibold leading-snug text-alloy-blue hover:underline underline-offset-2";

/** Contact row: channel values (phone / email) */
export const oppInqContactRow =
    "mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] leading-snug text-alloy-midnight/70";

/** Phone / email as links (same scale as row, not display-name size) */
export const oppInqContactChannelLink =
    "text-[12px] font-semibold leading-snug text-alloy-blue hover:underline underline-offset-2";

/** Muted inline hint inside contact row */
export const oppInqContactSep = "text-alloy-midnight/30 select-none";

/** Empty / helper copy */
export const oppInqMutedEmpty = "text-[12px] leading-snug text-alloy-midnight/50";

/** Role / status chip in family list */
export const oppInqRolePill =
    "inline-flex max-w-[9.5rem] items-center rounded-full border border-alloy-stone/25 bg-alloy-stone/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-alloy-midnight/70";

/** Inner card shell (two-column summary) — flex so columns stretch on large screens */
export const oppInqInnerCard =
    "flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-alloy-stone/[0.1] bg-white/[0.97] px-2.5 py-2.5 shadow-sm ring-1 ring-alloy-stone/[0.06]";

/** Communication / Notes segmented control */
export function oppInqTabBtn(active: boolean): string {
    return `rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
            ? "border-alloy-midnight/25 bg-alloy-midnight text-white"
            : "border-alloy-stone/25 bg-white text-alloy-midnight/75 hover:border-alloy-blue/35 hover:text-alloy-blue"
    }`;
}

/** Standard field control in “What matters now” */
export const oppInqFieldInput =
    "w-full min-w-0 rounded-lg border border-alloy-stone/20 bg-white px-2 py-1.5 text-[13px] font-medium text-alloy-midnight/90 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";

/** Read-only field surface (e.g. tour date) */
export const oppInqReadonlyField =
    "mt-0.5 rounded-lg border border-alloy-stone/15 bg-white px-2 py-1.5 text-[13px] font-medium text-alloy-midnight/75 shadow-sm";

/** Role chip — overview body (non-summary) family panel */
export const oppDrawerRolePillComfortable =
    "inline-flex max-w-[11rem] items-center rounded-full border border-alloy-blue/20 bg-alloy-blue/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-alloy-midnight/85";
