/**
 * Processing module typography tokens — content surfaces only.
 *
 * Layout, chrome, and zone surfaces use the Alloy Workspace doctrine
 * (`@/components/workspace/workspaceTokens` and `@/components/workspace/doctrine`).
 * Typography follows the three-level Workspace Doctrine V1 hierarchy.
 */

import {
    WS_TEXT_DISABLED,
    WS_TEXT_PRIMARY,
    WS_TEXT_SECONDARY,
} from "@/components/workspace/workspaceTokens";

/** Section band eyebrow — secondary hierarchy. */
export const PROCESSING_PANEL_EYEBROW =
    `text-[11px] font-semibold uppercase tracking-[0.07em] ${WS_TEXT_SECONDARY}`;

/** Panel section title — primary hierarchy. */
export const PROCESSING_PANEL_TITLE = `text-[13px] font-semibold tracking-tight ${WS_TEXT_PRIMARY}`;

/** Question / row primary label — primary hierarchy. */
export const PROCESSING_ROW_TITLE = `text-[13px] font-semibold leading-snug ${WS_TEXT_PRIMARY}`;

/** Supporting body copy — secondary hierarchy. */
export const PROCESSING_BODY = `text-[11px] leading-snug ${WS_TEXT_SECONDARY}`;

/** Metadata lines — secondary hierarchy. */
export const PROCESSING_METADATA = `text-[10px] leading-snug ${WS_TEXT_SECONDARY}`;

/** Queue row title — compact scan density; kept a touch smaller than the folder-category
 *  header so the categories read as headers and rows don't overpower them. */
export const PROCESSING_QUEUE_ROW_TITLE = `text-[12.5px] font-medium leading-snug ${WS_TEXT_PRIMARY}`;

/** Queue row metadata — supporting lines beneath title. */
export const PROCESSING_QUEUE_METADATA = `text-[11.5px] leading-snug ${WS_TEXT_SECONDARY}`;

/** Field labels in forms — secondary hierarchy (uppercase band). */
export const PROCESSING_FIELD_LABEL =
    `text-[10px] font-semibold uppercase tracking-[0.08em] ${WS_TEXT_SECONDARY}`;

/** Empty states — secondary hierarchy. */
export const PROCESSING_EMPTY = `text-[12px] leading-snug ${WS_TEXT_SECONDARY}`;

/** Disabled / placeholder copy only. */
export const PROCESSING_DISABLED = WS_TEXT_DISABLED;
