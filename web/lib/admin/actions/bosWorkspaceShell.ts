import type { CSSProperties } from "react";

/** Legacy centered modal width — dev galleries only. */
export const BOS_WORKSPACE_WIDTH = "min(86vw, 1400px)";

/** Workspace drawer — fills measured band between sidebar and BOS rail. */
export const BOS_WORKSPACE_DRAWER_WIDTH = "var(--adminv2-drawer-computed-width)";

/** Max panel height when viewport allows. */
export const BOS_WORKSPACE_MAX_HEIGHT_PX = 820;

/** @deprecated Stadium-shell band inset — kept for dev galleries. */
export const BOS_WORKSPACE_TOP_INSET = "3.75rem";

/** @deprecated Stadium-shell band gutter — kept for dev galleries. */
export const BOS_WORKSPACE_BAND_GUTTER = "0.75rem";

/** Centered modal height — legacy overlay presentation. */
export const BOS_WORKSPACE_PANEL_HEIGHT = `min(${BOS_WORKSPACE_MAX_HEIGHT_PX}px, 76vh)`;

/** Workspace drawer — fills vertical band above command rail inset. */
export const BOS_WORKSPACE_DRAWER_HEIGHT =
    "calc(100vh - var(--adminv2-drawer-inset-top, 3.75rem) - var(--adminv2-drawer-inset-bottom, 2rem) - 2rem)";

/** Embedded dev gallery — fixed preview frame. */
export const BOS_WORKSPACE_EMBEDDED_HEIGHT = "min(820px, 82vh)";

export const BOS_WORKSPACE_RADIUS = 20;

/** Full-bleed two-column intake uses the panel width. */
export const BOS_CANVAS_CONTENT_MAX_WIDTH = "100%";
export const BOS_CANVAS_CONTENT_PADDING_X = 0;

export const BOS_SHELL_HEADER_PADDING = "18px 28px 16px";
export const BOS_SHELL_MIDNIGHT_FORGE = "#273F52";
export const BOS_SHELL_TERRITORY_TITLE = "BOS";
export const BOS_SHELL_TERRITORY_TAGLINE =
    "BOS drafts a lead from inquiry material — you approve every detail.";
export const CREATE_LEAD_WORKSPACE_TITLE = "Create Lead";

export const BOS_WORKSPACE_PANEL_SHADOW: CSSProperties = {
    boxShadow: [
        "0 0 0 1px rgba(15,35,52,0.06)",
        "0 16px 48px rgba(15,35,52,0.14)",
        "0 4px 16px rgba(15,35,52,0.06)",
    ].join(", "),
};

/** Dim layer over workspace band only — sidebar and BOS rail stay visible. */
export const BOS_WORKSPACE_BAND_BACKDROP_STYLE: CSSProperties = {
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    background: "rgba(39, 63, 82, 0.12)",
};

/** Full-viewport atmospheric scrim — pushes page back without hiding sidebar or BOS rail. */
export const BOS_ACTION_WORKSPACE_VIEWPORT_SCRIM_STYLE: CSSProperties = {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: "none",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    background: [
        "radial-gradient(ellipse 80% 60% at 50% 42%, rgba(0,162,131,0.06), transparent 62%)",
        "radial-gradient(ellipse 100% 80% at 50% 50%, rgba(39,63,82,0.1), rgba(39,63,82,0.04) 55%, transparent 78%)",
    ].join(", "),
};

/** Thin midnight forge frame for the entire action workspace panel. */
export const BOS_ACTION_WORKSPACE_FORGE_PERIMETER_STYLE: CSSProperties = {
    boxShadow: "inset 0 0 0 1px rgba(39, 63, 82, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.85)",
};

/** Legacy full-viewport fog — centered modal only. */
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
