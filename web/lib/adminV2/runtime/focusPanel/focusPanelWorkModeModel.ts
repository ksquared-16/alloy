/**
 * FocusPanelWorkModeModel — the ONE canonical Focus Panel Work-mode contract (A).
 *
 * BOUNDARY (resolved). `OperationalSubjectViewModel` is `OpportunityDrawerViewModel` verbatim — the
 * broad drawer/record aggregate the Focus Panel consumes INCIDENTALLY during the drawer→Focus-Panel
 * migration, not its intended input. The forward, card-facing contract is `OperationalContext`
 * (`buildOperationalContext`: "New card code must consume OperationalContext, never the drawer VM
 * directly"). This model is the source-agnostic input the grid renders, so the grid never knows which
 * producer built it:
 *
 *     Provisioning answer  ─┐
 *                           ├─→  FocusPanelWorkModeModel  ─→  one grid + one set of card renderers
 *     Settlement/drawer VM ─┘
 *
 * COMPOSITION IS CONFIGURATION-DRIVEN, NEVER DATA-DRIVEN. The set + order + geometry of cells comes
 * from the published Focus Panel composition (the org's LayoutDoc), NOT from which data happens to be
 * present. A missing settlement value therefore RESERVES a cell; it never removes a configured cell.
 * The commit-critical (answer) producer and the enriched (drawer-VM) producer emit the SAME cells in
 * the SAME order with the SAME geometry — only each cell's `readiness` (and thus its content) differs.
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelCardModel, FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";

/**
 * Per-configured-card readiness. The grid renders geometry from this, never from data presence.
 *
 *   ready          — configured AND its authoritative data is in hand → render the card with content.
 *   reserved       — configured, settlement pending → reserve the cell's geometry; fill IN PLACE, no
 *                    reflow (the answer producer marks every non-commit-critical card reserved).
 *   not_applicable — configured but genuinely inapplicable to this subject → the cell is KEPT (never
 *                    removed) but the card renders its muted/empty treatment.
 *
 * There is no "not_configured" member: a not-configured card is simply absent from the composition,
 * so it never reaches this map.
 */
export type FocusPanelCardReadiness = "ready" | "reserved" | "not_applicable";

/** Which producer built the model. DIAGNOSTIC ONLY — the grid must never branch on it. */
export type FocusPanelWorkModeSource = "provisioning_answer" | "drawer_vm";

export type FocusPanelWorkModeModel = {
    /** Diagnostic provenance. The grid renders identically regardless of this. */
    source: FocusPanelWorkModeSource;
    mode: FocusPanelMode;
    /** Committed subject identity (Record of Attention). */
    subject: { id: string; type: "opportunity"; label: string };
    /** The forward, card-facing contract. Cards consume THIS — never a drawer VM. */
    context: OperationalContext;
    /** Per-configured-card display model (tier/span/insight/status). Keyed by canonical card id. */
    cardModels: ReadonlyMap<FocusPanelCardKey, FocusPanelCardModel>;
    /** Per-configured-card readiness — drives reserved geometry. */
    cardReadiness: ReadonlyMap<FocusPanelCardKey, FocusPanelCardReadiness>;
    title: string;
    statusLabel: string | null;
    canMutate: boolean;
    perspective: RuntimePerspective | null;
};

/** Readiness helper — a card is renderable-with-content only when `ready`. */
export function isCardReady(model: FocusPanelWorkModeModel, key: FocusPanelCardKey): boolean {
    return model.cardReadiness.get(key) === "ready";
}
