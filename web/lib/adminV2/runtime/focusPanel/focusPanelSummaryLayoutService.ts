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

/** Window event fired after a nested-surface draft save so the parent composer can rehydrate. */
export const FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT = "adminv2:focus-panel-summary-nested-saved";

export type FocusPanelSummaryRecordRef = {
    id: string;
    version: number;
    doc: LayoutDoc;
    updatedAt?: string | null;
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
 * Passes expectedUpdatedAt so a slower prior request cannot overwrite a newer edit.
 */
export async function saveFocusPanelSummaryDraft(
    state: FocusPanelSummaryLayoutState,
    doc: LayoutDoc,
    name: string = FOCUS_PANEL_SUMMARY_SURFACE_NAME,
): Promise<EntityLayoutRecord> {
    if (state.draft) {
        return patchEntityLayoutDraft(state.draft.id, name, doc, {
            expectedUpdatedAt: state.draft.updatedAt ?? null,
        });
    }
    if (state.published) {
        const forked = await duplicateEntityLayoutDraft(state.published.id, name);
        return patchEntityLayoutDraft(forked.id, name, doc, {
            expectedUpdatedAt: forked.updatedAt ?? null,
        });
    }
    return createFocusPanelSummaryDraft(doc, name);
}

/**
 * Cross-tab publish channel — the same shape the published Queue Row surface already uses
 * (`QUEUE_ROW_SURFACE_PUBLISHED_CHANNEL`). A publish in one tab must reach the others: before this,
 * invalidation was same-tab only with no TTL, so a second tab could hold a superseded layout
 * indefinitely.
 */
export const FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL = "alloy-focus-panel-summary";

/**
 * What a publish says about itself.
 *
 * The event was previously payloadless, so a listener could only respond by dropping every cached
 * scope and refetching. Carrying the published record's identity lets a consumer recognise a version
 * it already holds and skip the refetch — and it is the identity S5-3's omission protocol will need.
 *
 * Applicability scope is deliberately NOT part of this: a Focus Panel Summary is ONE published
 * document whose scope variants are selected when it is read, so a publish changes it for every
 * scope. Claiming a narrower scope here would be a lie about what changed.
 */
export type FocusPanelSummaryPublishedDetail = {
    surfaceId: string;
    layoutKey: string | null;
    entityType: string | null;
    version: number | null;
};

/** Announce a publish to this tab and to every other tab in this browser. */
export function dispatchFocusPanelSummaryPublished(detail: FocusPanelSummaryPublishedDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(FOCUS_PANEL_SUMMARY_PUBLISHED_EVENT, { detail }));
    try {
        const channel = new BroadcastChannel(FOCUS_PANEL_SUMMARY_PUBLISHED_CHANNEL);
        channel.postMessage({ type: "published", ...detail });
        channel.close();
    } catch {
        /* BroadcastChannel unavailable — same-tab event + TTL + foreground revalidation still apply */
    }
}

/** Publish a draft row and notify open runtime surfaces to refresh. */
export async function publishFocusPanelSummary(draftId: string): Promise<EntityLayoutRecord> {
    const published = await publishEntityLayoutDraft(draftId);
    dispatchFocusPanelSummaryPublished({
        surfaceId: published.id,
        layoutKey: published.layoutKey ?? null,
        entityType: published.entityType ?? null,
        version: typeof published.version === "number" ? published.version : null,
    });
    return published;
}
