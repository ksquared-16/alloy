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

import type { LayoutDoc, EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    loadFocusPanelSummaryLayout,
    saveFocusPanelSummaryDraft,
    publishFocusPanelSummary,
    FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT,
    type FocusPanelSummaryLayoutState,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryLayoutService";
import { buildFocusPanelSummaryDefaultDoc } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import {
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    collectUnsupportedEditableIdentityConfigs,
    formatUnsupportedEditablePublishError,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldEditContract";

type NestedSurfacesMetadata = Record<string, NestedSurfaceConfig>;

function assertNestedSurfaceEditableContract(config: NestedSurfaceConfig): void {
    const issues = collectUnsupportedEditableIdentityConfigs(config);
    if (issues.length === 0) return;
    throw new Error(formatUnsupportedEditablePublishError(issues));
}

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
 * Persist a nested surface config into the FP summary draft (does not auto-publish).
 * Publishing remains an explicit Focus Panel Summary / nested Publish action so
 * draft edits cannot race a silent publish over newer composition state.
 */
export async function saveNestedSurfaceConfig(surfaceId: string, config: NestedSurfaceConfig): Promise<EntityLayoutRecord> {
    assertNestedSurfaceEditableContract(config);
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
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent(FOCUS_PANEL_SUMMARY_NESTED_SAVED_EVENT, {
                detail: { surfaceId, draftId: draft.id, doc: draft.doc },
            }),
        );
    }
    return draft;
}

/** Persist nested surface config and publish the Focus Panel Summary draft. */
export async function saveAndPublishNestedSurfaceConfig(
    surfaceId: string,
    config: NestedSurfaceConfig,
): Promise<EntityLayoutRecord> {
    const draft = await saveNestedSurfaceConfig(surfaceId, config);
    return publishFocusPanelSummary(draft.id);
}

/** Validate all nested surfaces on a Focus Panel summary doc before publish. */
export function validateNestedSurfacesForPublish(doc: LayoutDoc): string | null {
    const nested = readNestedSurfaces(doc);
    const issues = Object.values(nested).flatMap((config) =>
        collectUnsupportedEditableIdentityConfigs(reconcileNestedSurfaceConfig(config.surfaceId, config)),
    );
    if (issues.length === 0) return null;
    return formatUnsupportedEditablePublishError(issues);
}
