/**
 * The one Alloy menu surface, shared rather than re-described.
 *
 * The Manage menu on the record drawer already established what an Alloy dropdown looks like: a
 * white gradient surface, a hairline stone border, the blue-tinted hover and active rows, and the
 * soft shadow. A second control that needs the same menu must not restate those class strings —
 * that is how two dropdowns drift apart, and how one of them ends up looking like the browser's
 * native grey `<select>` while the other looks like Alloy.
 *
 * These are class names, not a component. The menus differ in behaviour (one lists record actions,
 * one picks a position), and forcing them through a single component would couple two unrelated
 * interactions. What they must share is the SURFACE, and that is exactly what lives here.
 */

/** The floating panel: anchored, scrollable, Alloy surface. */
export const ALLOY_MENU_SURFACE =
    "z-[120] max-h-[min(22rem,70vh)] overflow-y-auto overflow-x-hidden rounded-xl border border-alloy-stone/15 " +
    "bg-gradient-to-b from-white via-white to-alloy-stone/[0.035] py-1.5 " +
    "shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)] ring-1 ring-alloy-stone/10 backdrop-blur-[2px]";

/** A row inside that panel. `active` is keyboard/pointer focus; `selected` is the current value. */
export function alloyMenuItemClassName(opts: {
    active?: boolean;
    disabled?: boolean;
    selected?: boolean;
} = {}): string {
    const base =
        "block w-full min-w-0 truncate whitespace-nowrap px-3 py-2 text-left text-[12px] font-medium leading-none " +
        "transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset " +
        "focus-visible:ring-alloy-blue/30 disabled:cursor-not-allowed disabled:opacity-45";
    const tone = opts.disabled
        ? "cursor-not-allowed text-alloy-midnight/45"
        : "text-alloy-midnight/88 hover:bg-alloy-blue/[0.09] active:bg-alloy-blue/[0.14] focus-visible:bg-alloy-blue/[0.08]";
    const active = opts.active && !opts.disabled ? "bg-alloy-blue/[0.06]" : "";
    // The current value stays legible when the keyboard cursor is elsewhere.
    const selected = opts.selected && !opts.disabled ? "font-semibold text-alloy-midnight" : "";
    return [base, tone, active, selected].filter(Boolean).join(" ");
}

/** The button that opens a menu — same border, radius and type scale as an Alloy field. */
export const ALLOY_MENU_TRIGGER =
    "mt-1 flex w-full items-center justify-between gap-2 rounded-[8px] border bg-white px-2 py-1 " +
    "text-left text-[12px] text-alloy-midnight outline-none transition-colors " +
    "hover:bg-alloy-blue/[0.04] focus-visible:ring-2 focus-visible:ring-alloy-blue/30 disabled:opacity-60";
