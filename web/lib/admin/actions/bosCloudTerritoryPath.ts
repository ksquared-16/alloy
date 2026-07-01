import type { CSSProperties } from "react";

/** Outer cloud territory — the BOS room */
export const BOS_OUTER_CLOUD_WIDTH = "min(1400px, 86vw)";
export const BOS_OUTER_CLOUD_HEIGHT = "min(920px, 82vh)";

export const BOS_CANVAS_WIDTH = BOS_OUTER_CLOUD_WIDTH;
export const BOS_CANVAS_HEIGHT = BOS_OUTER_CLOUD_HEIGHT;

/** Clear space below Alloy top nav */
export const BOS_CANVAS_TOP_OFFSET = 88;

/**
 * Desk inside the room — visible cloud margin, maximized vertical workspace.
 */
export const BOS_WORKSPACE_WIDTH = "calc(100% - 180px)";
export const BOS_WORKSPACE_HEIGHT = "calc(100% - 120px)";
export const BOS_WORKSPACE_TOP_OFFSET = 72;

export const BOS_WORKSPACE_RADIUS = 36;

/** Usable content column inside workspace card */
export const BOS_CANVAS_CONTENT_MAX_WIDTH = "min(1080px, calc(100% - 32px))";
export const BOS_CANVAS_CONTENT_PADDING_X = 32;

export const BOS_SHELL_HEADER_PADDING = "22px 32px 18px";
export const BOS_SHELL_TERRITORY_TITLE = "BOS";
export const BOS_SHELL_TERRITORY_TAGLINE = "Drafts leads from inquiry — you approve every detail.";
export const BOS_SHELL_MIDNIGHT_FORGE = "#273F52";

/** Soft desk card — not a hard modal slab */
export const BOS_WORKSPACE_SHADOW: CSSProperties = {
    boxShadow: "0 16px 55px rgba(15, 35, 52, 0.12), 0 0 0 1px rgba(255,255,255,0.55)",
};

/** Room-scale mint glow around cloud territory */
export const BOS_TERRITORY_DROP_SHADOW =
    "drop-shadow(0 0 28px rgba(0,162,131,0.22)) drop-shadow(0 0 64px rgba(0,162,131,0.14))";

/** Workspace fog backdrop */
export const BOS_BACKDROP_STYLE: CSSProperties = {
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: "rgba(39, 63, 82, 0.16)",
};

/** Hero intake paste canvas */
export const BOS_PASTE_CANVAS_MIN_HEIGHT = 440;
