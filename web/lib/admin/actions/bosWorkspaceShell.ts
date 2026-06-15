import type { CSSProperties } from "react";
import { ACTION_WORKSPACE_VIEWPORT_INSET } from "@/lib/admin/actions/actionWorkspaceBosTheme";

/** Production Create Lead — locked horizontal stadium shell. @see bos-operational-intake-shell-doctrine.md */
export const BOS_WORKSPACE_WIDTH = "min(1200px, 84vw)";

/** Max panel height when viewport allows; shrinks inside the header–command band. */
export const BOS_WORKSPACE_MAX_HEIGHT_PX = 760;

/** Below AdminV2 shell header (`--adminv2-drawer-inset-top`). */
export const BOS_WORKSPACE_TOP_INSET = "3.75rem";

/** Breathing room inside the band (top + bottom). */
export const BOS_WORKSPACE_BAND_GUTTER = "0.75rem";

/**
 * Panel height — fits between shell header and BOS Command Center without page scroll.
 * @see ActionWorkspaceShell panelHeight
 */
export const BOS_WORKSPACE_PANEL_HEIGHT = `min(${BOS_WORKSPACE_MAX_HEIGHT_PX}px, calc(100vh - ${BOS_WORKSPACE_TOP_INSET} - ${ACTION_WORKSPACE_VIEWPORT_INSET} - ${BOS_WORKSPACE_BAND_GUTTER} * 2))`;

/** Embedded dev gallery — fixed preview frame. */
export const BOS_WORKSPACE_EMBEDDED_HEIGHT = "min(820px, 82vh)";

export const BOS_WORKSPACE_RADIUS = 24;

export const BOS_CANVAS_CONTENT_MAX_WIDTH = "min(1080px, calc(100% - 40px))";
export const BOS_CANVAS_CONTENT_PADDING_X = 36;

export const BOS_SHELL_HEADER_PADDING = "22px 36px 18px";
export const BOS_SHELL_MIDNIGHT_FORGE = "#273F52";
export const BOS_SHELL_TERRITORY_TITLE = "BOS";
export const BOS_SHELL_TERRITORY_TAGLINE = "Drafts leads from inquiry — you approve every detail.";

export const BOS_WORKSPACE_PANEL_SHADOW: CSSProperties = {
    boxShadow: [
        "0 0 0 1px rgba(15,35,52,0.06)",
        "0 16px 48px rgba(15,35,52,0.14)",
        "0 4px 16px rgba(15,35,52,0.06)",
    ].join(", "),
};

/** Fog backdrop behind workspace */
export const BOS_BACKDROP_STYLE: CSSProperties = {
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    background: "rgba(39, 63, 82, 0.18)",
};

/** Subtle Bend Pine ambient glow — no cloud outline */
export const BOS_AMBIENT_GLOW_STYLE: CSSProperties = {
    background:
        "radial-gradient(ellipse 72% 58% at 50% 42%, rgba(0,162,131,0.14), rgba(0,162,131,0.04) 52%, transparent 72%)",
    filter: "blur(32px)",
};

/** Hero intake paste canvas — shrinks on short viewports via ActionWorkspacePasteCanvas */
export const BOS_PASTE_CANVAS_MIN_HEIGHT = 360;
