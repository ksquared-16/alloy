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

import type { OperationalContext, OperationalSubjectRef } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelCardModel, FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { RuntimePerspective } from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

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

/**
 * Which producer built the model. DIAGNOSTIC ONLY — the grid must never branch on it.
 *
 * `durable_subject` is the queue-independent producer: a record attended subject-first, with no
 * provisioning answer and possibly no case at all. It declares `phase: "settled"` like any other
 * fully-composed producer — which is exactly why `phase` was separated from `source` in the first
 * place (see {@link FocusPanelSettlementPhase}); under the old inference it would have had to call
 * itself `drawer_vm` to be treated as resolved.
 */
export type FocusPanelWorkModeSource = "provisioning_answer" | "drawer_vm" | "durable_subject";

/**
 * How far the surface has advanced — a DECLARED fact, not an inference from provenance.
 *
 *   commit  — the commit-critical answer is in hand; cards outside it are genuinely still settling.
 *   settled — settlement has run; a card that is still not ready is RESOLVED-empty, not loading.
 *
 * This exists because the renderer used to derive it from `source === "drawer_vm"`, i.e. from the
 * producer's NAME — which both contradicts the "never branch on it" rule above and silently blocks a
 * second surface: a Child producer would have had to call itself `drawer_vm` to get settled
 * semantics. Producers declare their phase; the grid reads the phase.
 */
export type FocusPanelSettlementPhase = "commit" | "settled";

export type FocusPanelWorkModeModel = {
    /** Diagnostic provenance. The grid renders identically regardless of this. */
    source: FocusPanelWorkModeSource;
    /** Declared surface phase — the grid reads THIS, never `source`. */
    phase: FocusPanelSettlementPhase;
    mode: FocusPanelMode;
    /**
     * Committed subject identity (Record of Attention). Grain-agnostic PLATFORM contract: the subject
     * `type` is generic (`OperationalSubjectRef.type: string` — the same shape cards already consume via
     * `context.subject`), NOT the `"opportunity"` literal. Domain producers supply their concrete type
     * (the opportunity composers supply `"opportunity"`); a second surface (e.g. a `child` subject —
     * `SECOND-SURFACE-CERTIFICATION-DESIGN.md`) supplies its own without any platform-layer change. No
     * runtime branch READS this `type` except composition selection — the grid narrows it through
     * `asFocusPanelSubjectGrain` to pick the code-owned default composition, which is the selection
     * this openness existed for. Nothing else branches on it (only `.id` is read); guards that DO test it (BillingPreview,
     * Scheduling) already compare against `"opportunity"` and correctly yield null for other subjects.
     */
    subject: OperationalSubjectRef;
    /** The forward, card-facing contract. Cards consume THIS — never a drawer VM. */
    context: OperationalContext;
    /** Per-configured-card display model (tier/span/insight/status). Keyed by canonical card id. */
    cardModels: ReadonlyMap<FocusPanelCardKey, FocusPanelCardModel>;
    /** Per-configured-card readiness — drives reserved geometry. */
    cardReadiness: ReadonlyMap<FocusPanelCardKey, FocusPanelCardReadiness>;
    /**
     * Primary commands (the operator's next actions). Commit-critical: the truthful primary action at
     * commit; the enriched producer carries the full resolved command set. Drives the primary-next-action
     * invoke and the communications composer.
     */
    commands: ResolvedActionForClient[];
    title: string;
    statusLabel: string | null;
    canMutate: boolean;
    perspective: RuntimePerspective | null;
};

/** Readiness helper — a card is renderable-with-content only when `ready`. */
export function isCardReady(model: FocusPanelWorkModeModel, key: FocusPanelCardKey): boolean {
    return model.cardReadiness.get(key) === "ready";
}
