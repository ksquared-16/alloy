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
import { focusPanelDefaultCompositionForGrain } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
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

    /*
     * ── THE COMPOSITION'S DECLARED DENSITY SELECTS THE FINANCIALS PRESENTATION ──
     *
     * Financials is the one card that ships two approved presentations of one read model: the full
     * period reconciliation, and a compact supporting-context version for process surfaces that
     * need the balance and the ways in without the breakdown. Both are the same VM and the same
     * ownership; density chooses which questions the placement answers.
     *
     * The card model hardcodes `standard`, and the composition's `encodedDensity` is documented as
     * render-inert metadata — so the compact placement the case composition already declares was
     * unreachable, and the compact presentation existed only in the lab. This is where the two
     * meet: the grain's composition is resolved here, and the model is built here.
     *
     * Scoped to `financials` deliberately. A blanket density override would silently re-render
     * every card whose composition entry disagrees with its model default, which is a much larger
     * change than the one being asked for and not one anyone has looked at.
     */
    const composition = focusPanelDefaultCompositionForGrain(context.subject.type);
    const financialsEntry = composition?.find((entry) => entry.key === "financials");
    const financialsModel = cards.get("financials");
    if (financialsEntry?.encodedDensity && financialsModel) {
        cards.set("financials", { ...financialsModel, density: financialsEntry.encodedDensity });
    }

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
