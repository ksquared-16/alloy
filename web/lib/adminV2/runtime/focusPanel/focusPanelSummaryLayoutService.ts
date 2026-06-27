/**
 * Enrollment Focus Panel Summary — persistence service (configure → publish loop).
 *
 * Thin client over the existing `entity_layouts` REST API. No parallel storage,
 * no schema: the surface persists as one `entity_layouts` row
 * (entity_type=opportunities, surface=drawer, layout_key=focus_panel_summary).
 *
 * Loop:
 *   - load()      → { draft, published } (draft = working copy, published = live)
 *   - saveDraft() → upsert the working doc into a draft (forks published if needed)
 *   - publish()   → mark the draft published; dispatches a runtime refresh event
 */

import {
    duplicateEntityLayoutDraft,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import {
    FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
    FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
    FOCUS_PANEL_SUMMARY_SURFACE,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";

export const FOCUS_PANEL_SUMMARY_SURFACE_NAME = "Enrollment Focus Panel Summary";

/** Window event fired after a publish so open runtime surfaces refresh. */
export const FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT = "adminv2:focus-panel-summary-published";

export type FocusPanelSummaryRecordRef = {
    id: string;
    version: number;
    doc: LayoutDoc;
};

export type FocusPanelSummaryLayoutState = {
    draft: FocusPanelSummaryRecordRef | null;
    published: FocusPanelSummaryRecordRef | null;
};

/** Resolve the org's draft + published Focus Panel Summary docs. */
export async function loadFocusPanelSummaryLayout(): Promise<FocusPanelSummaryLayoutState> {
    const res = await fetch("/api/admin/entity-layouts/focus-panel-summary");
    const json = (await res.json().catch(() => ({}))) as
        | { published: FocusPanelSummaryRecordRef | null; draft: FocusPanelSummaryRecordRef | null; error?: string }
        | Record<string, never>;
    if (!res.ok) throw new Error(("error" in json && json.error) || "Failed to load surface");
    return {
        draft: ("draft" in json ? json.draft : null) ?? null,
        published: ("published" in json ? json.published : null) ?? null,
    };
}

async function createFocusPanelSummaryDraft(doc: LayoutDoc, name: string): Promise<EntityLayoutRecord> {
    const res = await fetch("/api/admin/entity-layouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            entity_type: FOCUS_PANEL_SUMMARY_ENTITY_TYPE,
            surface: FOCUS_PANEL_SUMMARY_SURFACE,
            layout_key: FOCUS_PANEL_SUMMARY_LAYOUT_KEY,
            name,
            doc,
        }),
    });
    const json = (await res.json().catch(() => ({}))) as EntityLayoutRecord & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Could not create surface draft");
    return json;
}

/**
 * Save the working doc as a draft. Forks the published row to a new draft when
 * no draft exists yet, so publishing never mutates the live row in place.
 */
export async function saveFocusPanelSummaryDraft(
    state: FocusPanelSummaryLayoutState,
    doc: LayoutDoc,
    name: string = FOCUS_PANEL_SUMMARY_SURFACE_NAME,
): Promise<EntityLayoutRecord> {
    if (state.draft) {
        return patchEntityLayoutDraft(state.draft.id, name, doc);
    }
    if (state.published) {
        const forked = await duplicateEntityLayoutDraft(state.published.id, name);
        return patchEntityLayoutDraft(forked.id, name, doc);
    }
    return createFocusPanelSummaryDraft(doc, name);
}

/** Publish a draft row and notify open runtime surfaces to refresh. */
export async function publishFocusPanelSummary(draftId: string): Promise<EntityLayoutRecord> {
    const published = await publishEntityLayoutDraft(draftId);
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT));
    }
    return published;
}
