"use client";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useSurfaceBuilderChromeContext } from "@/components/adminV2/settings/surfaces/SurfaceBuilderChromeContext";

/**
 * Save / Publish / Undo / Reset for the active Surface builder — rendered on the
 * workspace tab row (not as a second toolbar under the tabs).
 */
export function SurfaceEditTabActions() {
    const { chrome } = useSurfaceBuilderChromeContext();
    if (!chrome) return null;

    const showSave = chrome.showSaveDraft !== false && Boolean(chrome.onSaveDraft);
    const showHistory = chrome.showHistoryControls !== false && (Boolean(chrome.onUndo) || Boolean(chrome.onReset));

    return (
        <div
            className="ml-auto flex shrink-0 flex-wrap items-center gap-2 py-1.5 pl-3"
            data-testid="surfaces-edit-tab-actions"
        >
            {chrome.dirty ?
                <span className="config-typo-sublabel text-amber-800" data-testid="surfaces-edit-dirty">
                    Unpublished changes
                </span>
            :   null}
            {showHistory && chrome.onUndo ?
                <button
                    type="button"
                    data-testid="surface-edit-undo"
                    onClick={chrome.onUndo}
                    disabled={!chrome.canUndo}
                    className="config-secondary-btn config-primary-btn--sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Undo
                </button>
            :   null}
            {showHistory && chrome.onReset ?
                <button
                    type="button"
                    data-testid="surface-edit-reset"
                    onClick={chrome.onReset}
                    className="config-secondary-btn config-primary-btn--sm"
                >
                    Reset to default
                </button>
            :   null}
            {showSave ?
                <button
                    type="button"
                    data-testid="surface-save-draft"
                    onClick={chrome.onSaveDraft}
                    disabled={chrome.saveDisabled || chrome.saving || chrome.publishing}
                    className="config-secondary-btn config-primary-btn--sm disabled:opacity-40"
                >
                    {chrome.saving ? "Saving…" : "Save draft"}
                </button>
            :   null}
            {chrome.onPublish ?
                <ConfigurationPrimaryButton
                    data-testid="surface-publish"
                    onClick={chrome.onPublish}
                    disabled={chrome.publishDisabled || chrome.saving || chrome.publishing}
                    className="config-primary-btn--sm"
                >
                    {chrome.publishing ? "Publishing…" : "Publish"}
                </ConfigurationPrimaryButton>
            :   null}
        </div>
    );
}
