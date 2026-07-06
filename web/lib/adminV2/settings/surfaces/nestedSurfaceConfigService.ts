/**
 * Nested Surface config persistence.
 *
 * Nested surface field selections persist as real config on the Focus Panel
 * summary `entity_layouts` doc metadata (`metadata.nestedSurfaces[surfaceId]`) —
 * no parallel storage. Reuses the existing FP summary draft/publish loop, so
 * saving a nested surface goes through the same publish path as the panel itself.
 *
 * Live runtime: Children + Billing Preview consume published config via
 * nestedSurfaceConfigReader. Full nested-surface overlay render remains deferred.
 *
 * @see nestedSurfaceEditorModel.ts
 * @see focusPanelSummaryLayoutService.ts
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    loadFocusPanelSummaryLayout,
    saveFocusPanelSummaryDraft,
    publishFocusPanelSummary,
    type FocusPanelSummaryLayoutState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import { buildFocusPanelSummaryDefaultDoc } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type NestedSurfacesMetadata = Record<string, NestedSurfaceConfig>;

function readNestedSurfaces(doc: LayoutDoc | undefined | null): NestedSurfacesMetadata {
    const raw = (doc?.metadata?.nestedSurfaces ?? null) as NestedSurfacesMetadata | null;
    return raw && typeof raw === "object" ? raw : {};
}

function baseDocFrom(state: FocusPanelSummaryLayoutState): LayoutDoc {
    return state.draft?.doc ?? state.published?.doc ?? buildFocusPanelSummaryDefaultDoc();
}

/** Load the persisted nested surface config (reconciled with the registry). */
export async function loadNestedSurfaceConfig(surfaceId: string): Promise<NestedSurfaceConfig> {
    try {
        const state = await loadFocusPanelSummaryLayout();
        const doc = baseDocFrom(state);
        const stored = readNestedSurfaces(doc)[surfaceId] ?? null;
        return reconcileNestedSurfaceConfig(surfaceId, stored);
    } catch {
        // Fail soft — operator still gets the default config to edit.
        return reconcileNestedSurfaceConfig(surfaceId, null);
    }
}

/**
 * Persist a nested surface config into the FP summary doc metadata and publish.
 * Returns the published record id.
 */
export async function saveNestedSurfaceConfig(surfaceId: string, config: NestedSurfaceConfig): Promise<void> {
    const state = await loadFocusPanelSummaryLayout();
    const base = baseDocFrom(state);
    const nextDoc: LayoutDoc = {
        ...base,
        metadata: {
            ...(base.metadata ?? {}),
            nestedSurfaces: {
                ...readNestedSurfaces(base),
                [surfaceId]: config,
            },
        },
    };
    const draft = await saveFocusPanelSummaryDraft(state, nextDoc);
    await publishFocusPanelSummary(draft.id);
}
