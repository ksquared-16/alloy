/**
 * Condensed queue row card shell — shared by runtime rows and the Queue Row Builder canvas.
 *
 * Visual chrome (perimeter + soft depth) lives on `.alloy-os-queue-row-card` in
 * alloyOsRuntime.css and reuses the Focus Panel Universal Card elevation tokens
 * (`--alloy-os-fp-card-shadow` / border) so queue and Focus Panel read as one surface language.
 */

export const QUEUE_ROW_CARD_SHELL_CLASS =
    "alloy-os-queue-row-card motion-control relative block w-full overflow-visible rounded-[14px] border bg-white px-3 py-2.5 text-left";

export const QUEUE_ROW_CARD_IDLE_BORDER_CLASS =
    "hover:!bg-alloy-bend-pine/[0.04] active:!bg-alloy-bend-pine/[0.08]";

export const QUEUE_ROW_CARD_SELECTED_BORDER_CLASS =
    "alloy-os-queue-row-card--selected !bg-alloy-bend-pine/[0.06] hover:!bg-alloy-bend-pine/[0.08]";

/**
 * Selected state is perimeter + tint only (`QUEUE_ROW_CARD_SELECTED_BORDER_CLASS`).
 * Decorative left rails are retired — keep this empty so legacy callers render nothing.
 */
export const QUEUE_ROW_SELECTED_RAIL_CLASS = "";

export const QUEUE_ROW_BUILDER_SHELL_DATA_ATTR = "data-queue-row-builder-shell";
