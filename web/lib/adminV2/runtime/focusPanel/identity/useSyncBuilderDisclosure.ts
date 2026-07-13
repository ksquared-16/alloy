"use client";

import { useEffect } from "react";

import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityDisclosureState } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";
import { useFocusPanelComposer } from "@/lib/adminV2/settings/surfaces/focusPanelComposerContext";

type DisclosureActions = {
    enterContext: () => void;
    selectIdentity: (identityId: string, sectionKey?: string) => void;
    enterEvidence: (identityId: string, sectionKey?: string) => void;
    reset: () => void;
};

/** Keep runtime disclosure depth aligned with shared builder configuration purpose. */
export function useSyncBuilderDisclosure(
    composing: boolean,
    disclosure: IdentityDisclosureState,
    actions: DisclosureActions,
    composeCanvasMode?: "configure" | "preview",
) {
    const composer = useFocusPanelComposer();

    useEffect(() => {
        // Preview/runtime disclosure owns navigation — never reset from composer purpose.
        if (!composing || !composer || composeCanvasMode === "preview") return;

        const purpose = composer.activeConfigPurpose;
        const identityId = composer.selectedIdentityId;
        const groupKey =
            composer.selection?.kind === "region" || composer.selection?.kind === "field"
                ? composer.selection.groupKey
                : undefined;

        if (purpose === "summary") {
            if (disclosure.depth !== "summary") actions.reset();
            return;
        }

        if (purpose === "context_facts") {
            if (disclosure.depth === "summary") actions.enterContext();
            if (disclosure.depth === "details" || disclosure.depth === "evidence") actions.enterContext();
            return;
        }

        if (purpose === "details") {
            if (identityId) {
                if (disclosure.selectedIdentityId !== identityId || disclosure.depth !== "details") {
                    if (disclosure.depth === "summary") actions.enterContext();
                    actions.selectIdentity(identityId, groupKey);
                }
            } else if (disclosure.depth === "summary") {
                actions.enterContext();
            }
            return;
        }

        if (purpose === "evidence" && identityId) {
            if (disclosure.depth !== "evidence" || disclosure.selectedIdentityId !== identityId) {
                actions.enterEvidence(identityId, groupKey);
            }
        }
    }, [
        actions,
        composing,
        composer,
        composer?.activeConfigPurpose,
        composer?.selectedIdentityId,
        composer?.selection,
        disclosure.depth,
        disclosure.selectedIdentityId,
        composeCanvasMode,
    ]);
}

export function builderPurposeForDisclosureDepth(
    depth: IdentityDisclosureState["depth"],
): IdentityConfigurationPurpose {
    if (depth === "context") return "context_facts";
    if (depth === "details") return "details";
    if (depth === "evidence") return "evidence";
    return "summary";
}
