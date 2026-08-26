/**
 * Producer: settlement/drawer VM → FocusPanelWorkModeModel (the ENRICHED source).
 *
 * A behavior-neutral wrap of the two derivations the grid does today — the card models
 * (`deriveOpportunityFocusPanelPresentation`) and the card-facing context
 * (`buildOperationalContext`) — projected onto the canonical `FocusPanelWorkModeModel`. This is the
 * seam that lets the grid stop reading the drawer VM: once the grid consumes the model, THIS is the
 * only place the enriched path touches `OpportunityDrawerViewModel`.
 *
 * Readiness: a card the enriched derivation marks `visible === false` becomes `not_applicable` — the
 * cell is KEPT (never dropped), matching the configuration-driven-composition invariant. Everything
 * else is `ready`.
 */

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type {
    FocusPanelCardReadiness,
    FocusPanelWorkModeModel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

export type FocusPanelWorkModeFromDrawerVmInput = {
    /**
     * The participation attention is currently on, when the runtime selected one. The panel stays
     * CASE grain; this is only which participant the operator is presently concerned with.
     */
    selectedParticipationId?: string | null;
    mode: FocusPanelMode;
    displayVm: OpportunityDrawerViewModel;
    record: Record<string, unknown>;
    title: string;
    perspective: RuntimePerspective | null;
    statusLabel: string | null;
    canMutate: boolean;
};

export function focusPanelWorkModeModelFromDrawerVm(
    input: FocusPanelWorkModeFromDrawerVmInput,
): FocusPanelWorkModeModel {
    const { mode, displayVm, record, title, perspective, statusLabel, canMutate } = input;

    const { cards } = deriveOpportunityFocusPanelPresentation({
        mode,
        displayVm,
        record,
        title,
        perspective,
        statusLabel,
    });

    const context = buildOperationalContext({
        subjectId: displayVm.entity.id,
        title,
        subjectVm: displayVm,
        truth: record,
        perspective,
        statusLabel,
        canMutate,
        selectedParticipationId: input.selectedParticipationId ?? null,
    });

    const cardReadiness = new Map<FocusPanelCardKey, FocusPanelCardReadiness>();
    for (const [key, model] of cards) {
        cardReadiness.set(key, model.visible ? "ready" : "not_applicable");
    }

    return {
        source: "drawer_vm",
        // Settlement has run: a card still not ready here is resolved-empty, not loading.
        phase: "settled",
        mode,
        subject: { id: displayVm.entity.id, type: "opportunity", label: title },
        context,
        cardModels: cards,
        cardReadiness,
        commands: displayVm.actions.header_menu,
        title,
        statusLabel,
        canMutate,
        perspective,
    };
}
