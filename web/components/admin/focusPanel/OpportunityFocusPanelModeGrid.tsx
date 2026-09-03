"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import FocusPanelCardRenderer from "@/components/admin/focusPanel/FocusPanelCardRenderer";
// Activity cockpit is rendered ONLY when `mode === "activity"` (an operator interaction, never the
// first-paint mode). Statically importing it pulled the whole Communications stack (~1.4k-line
// CommunicationsDrawerSection + messaging composer/threads + tab panes) into the initial Work Unit
// chunk, where it must download+hydrate before the first provisioning request can fire. Load it on
// demand so it leaves the first-paint critical path; the Activity data cache is prewarmed separately
// (focusPanelActivityPrewarm), so the switch stays fast.
const OpportunityFocusPanelEmbeddedWorkspace = dynamic(
    () => import("@/components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace"),
    { ssr: false },
);
import { resolveFocusPanelModeGrid } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { cardTitle } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import {
    deriveFocusPanelGridFromLayoutDoc,
    deriveFocusPanelInstanceMap,
} from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    composeEffectiveCardModel,
    type FocusPanelCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { setFocusPanelCardParticipation } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReadinessTiming";
import { asFocusPanelSubjectGrain } from "@/lib/adminV2/runtime/focusPanel/focusPanelSubjectGrainRead";
import { hasInnerDismissibleLayer } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";
import {
    buildOpportunityFocusPanelMutation,
    resolveFocusPanelMutationOpportunityId,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { CompositionCardInput } from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import { publishedLayoutReadingOrder } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    isElevatedLevel,
    resolveElevatedCellKey,
    type FocusPanelActiveDepth,
    type FocusPanelCoordination,
    type FocusPanelCurrentWorkWorkspaceIntent,
    type FocusPanelCurrentWorkWorkspaceState,
    type FocusPanelDepthEntry,
    type FocusPanelDismissSignal,
    type FocusPanelFocusRequest,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    focusPanelSummaryUsesPublishedDoc,
    resolveFocusPanelSummaryActiveDoc,
} from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryActiveDoc";
import { usePublishedFocusPanelSummaryDoc } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import { FOCUS_PANEL_CARD_KEYS, type FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { resolveCommunicationsComposerAction } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCommunicationsComposerAction";
import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Reverse-zoom dismiss window — matches CSS `--alloy-os-fp-depth-ms` (240ms). */
const FOCUS_PANEL_DEPTH_MS = 240;

/** Operator-facing identity for a configured card, shown while its settlement detail prepares. */
// Card titles are declared in the Focus Panel card REGISTRY (the extensibility contract, Workstream C/D)
// — `cardTitle(key)`. The former local `FOCUS_PANEL_CARD_TITLES` map migrated there 1:1 (incl. the
// `milestones` card staging added — carried into the registry so its title survives the migration).

/**
 * RESERVED cell — a configured card whose SETTLEMENT detail has not yet arrived. It holds the cell's
 * geometry (card shell + min-height) so Settlement fills it IN PLACE with no reflow, and never removes
 * a configured cell. Per the Runtime contract, a reserved cell is NOT a blank white rectangle: it
 * shows the card's IDENTITY (title) and a compact preparing state, so the committed panel reads as a
 * complete surface whose secondary detail is settling — not a loading placeholder.
 */
function ReservedFocusPanelCell({ typeKey, settled }: { typeKey: FocusPanelCardKey; settled?: boolean }) {
    const title = cardTitle(typeKey);
    // CALM NEUTRAL HOLD (Kelly). Not a loading placeholder and not a "Preparing…" spinner: the cell
    // shows the card's IDENTITY plus a quiet, STATIC content hint (no pulse — Settlement fills it in
    // place). It reads as a settled part of the surface whose detail is arriving, so the two-phase
    // reveal is barely perceptible and never chatters. The panel already owns the aria-busy state, so
    // the hold is aria-hidden rather than announcing per cell.
    //
    // `settled` = the card RESOLVED as not-applicable to this record. It is NOT loading, so it must
    // NOT show the content hint (that reads as a card that loads forever). It keeps the cell (stable
    // composition, no reflow) but renders as a quiet resolved-empty state, not a settling reserve.
    return (
        <div
            className="alloy-os-ucard"
            data-focus-panel-cell-reserved={settled ? undefined : "true"}
            data-focus-panel-cell-not-applicable={settled ? "true" : undefined}
            data-focus-panel-cell-preparing={settled ? undefined : typeKey}
            style={{ minHeight: "7.5rem", padding: "0.875rem", opacity: settled ? 0.72 : undefined }}
        >
            {title ? (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">
                    {title}
                </span>
            ) : null}
            {settled ? null : (
                <div className="mt-3 space-y-2" aria-hidden="true">
                    <span className="block h-2 w-1/2 rounded-full bg-alloy-stone/12" />
                    <span className="block h-2 w-1/3 rounded-full bg-alloy-stone/[0.08]" />
                </div>
            )}
        </div>
    );
}

type Props = {
    model: FocusPanelWorkModeModel;
    onSelectTab: (tab: DrawerTabKey) => void;
    onHeaderAction?: (action: ResolvedActionForClient) => void;
    onModeChange?: (mode: FocusPanelMode) => void;
    /**
     * A card the SELECTION asked to land on (today: Search).
     *
     * Passed in rather than read from the drawer context because this component is
     * deliberately source-agnostic — it renders a model and must not know where the
     * selection came from. `subject_key` scopes the request so switching subject
     * re-applies focus, while unrelated re-renders do not fight an operator who has
     * since focused something else.
     */
    requestedCardFocus?: { card_key: string; item_id?: string | null; subject_key?: string | null } | null;
};

/** Renders a mode grid from a source-agnostic `FocusPanelWorkModeModel` — never the drawer VM. */
export default function OpportunityFocusPanelModeGrid({
    model,
    onSelectTab,
    onHeaderAction,
    onModeChange,
    requestedCardFocus,
}: Props) {
    // Source-agnostic: the model is produced identically from the provisioning answer (commit-critical)
    // or the drawer VM (enriched). The grid never knows which — configuration determines composition,
    // readiness determines each cell's content state.
    const {
        mode,
        context: operationalContext,
        cardModels: cards,
        cardReadiness,
        commands,
        title,
        statusLabel,
        perspective,
        canMutate,
    } = model;
    // Attention subject may be the child; mutations + activity entity binding stay on the
    // family opportunity (Record of Truth) so child-grain saves/photo patches stick.
    const drawerId = resolveFocusPanelMutationOpportunityId({
        subjectId: model.subject.id,
        grain: operationalContext.grain,
        truth: operationalContext.truth,
    });
    const record = operationalContext.truth;
    const workflowActive = operationalContext.stageWorkRuntime?.primary?.state === "open";
    const defaultGrid = useMemo(() => resolveFocusPanelModeGrid(mode, workflowActive), [mode, workflowActive]);

    // Summary is the configurable surface: read the org's PUBLISHED LayoutDoc (or
    // the code-built default — visually identical) and resolve per-instance config.
    // The Household card is part of this canonical composition (no flag, no
    // reference-only override).
    const isSummary = mode === "summary";
    const subjectGrain = asFocusPanelSubjectGrain(model.subject.type);
    /**
     * Does a settled family opportunity stand behind this subject?
     *
     * The durable path opens a record subject-first — no Opportunity, no lens — so nothing
     * family-scoped is authoritative and its composition stays sparse. Every other source reached
     * this panel through an operational lens, where `overlayChildMissionOntoSettledFocusModel`
     * states the contract: Record of Attention = the focused child, Record of Truth / Settlement =
     * the family opportunity. That is a CONTEXT distinction, not a grain one — expressing it as a
     * grain would have re-litigated `cardAppliesToGrain` and leaked family cards onto every child.
     */
    const familySettlement = model.source !== "durable_subject";
    /*
     * WHICH SUBJECTS COMPOSE FROM THE ORG'S PUBLISHED SURFACE.
     *
     * The rule lives in `focusPanelSummaryUsesPublishedDoc`, which is also what the pending
     * skeleton asks — one answer, not two. It is `(grain, context)` rather than grain alone
     * because the enrollment Work Unit row IS a child subject standing on a family opportunity:
     * gating on grain alone silently overrode the operator's published Surface with a hard-coded
     * composition on the very surface they authored it for. A person or household subject still
     * gets its code-owned default; that is the hazard the gate exists for, and it is unchanged.
     */
    const usesPublishedDoc = focusPanelSummaryUsesPublishedDoc(subjectGrain, { familySettlement });
    const publishedDoc = usePublishedFocusPanelSummaryDoc(isSummary && usesPublishedDoc);
    // Resolved through the SAME function the pending skeleton uses, so the surface cannot
    // be composed from one document while loading and another once settled.
    const activeDoc = resolveFocusPanelSummaryActiveDoc({
        isSummary,
        grain: subjectGrain,
        publishedDoc,
        context: { familySettlement },
    });
    const instanceMap = useMemo(
        () => (activeDoc ? deriveFocusPanelInstanceMap(activeDoc) : new Map()),
        [activeDoc],
    );
    const grid = useMemo(() => {
        if (!isSummary || !activeDoc) return defaultGrid;
        const derived = deriveFocusPanelGridFromLayoutDoc(activeDoc);
        return derived.rows.length > 0 ? derived : defaultGrid;
    }, [isSummary, activeDoc, defaultGrid]);

    // Record-independent composition inputs for the Summary surface — the SAME derivation
    // the pending skeleton (`FocusPanelSummarySkeleton`) uses WITHOUT cards, guaranteeing an
    // identical grid strategy + cell positions pending → resolved (only content transitions).
    // Here the resolved `cards` map is passed so the visibility filter applies exactly as
    // before (behavior-preserving extraction). Non-summary modes keep the legacy grid path.
    const summaryInputs = useMemo(
        () => (isSummary ? deriveFocusPanelSummaryCompositionInputs(activeDoc) : null),
        [isSummary, activeDoc],
    );
    // Operator-published explicit layout (source of truth). When present the runtime
    // renders these exact rows/widths; otherwise it falls back to auto-composition.
    const publishedLayout = isSummary ? summaryInputs?.publishedLayout ?? null : null;

    // ── Layout SOURCE tracer (the "correct → overwritten" diagnostic) ────────
    // Records, whenever the resolved layout changes, WHERE the runtime layout came from
    // (published doc vs code default), whether a published layout/grid is present, and the
    // authored card order — so a reflow can be pinned to its source. Dev-only; exposed as
    // `window.__focusPanelLayoutLog` (history) + `window.__focusPanelLayoutSource` (latest).
    useEffect(() => {
        if (!isSummary || typeof window === "undefined" || process.env.NODE_ENV === "production") return;
        const entry = {
            docSource: publishedDoc ? "published-doc" : "default-doc",
            publishedLayout: publishedLayout ? "present" : "null",
            grid: publishedLayout?.grid ? "present" : "absent",
            gridAreas: publishedLayout?.grid?.areas.length ?? 0,
            order: publishedLayout ? publishedLayoutReadingOrder(publishedLayout) : [],
            sections: activeDoc?.sections?.length ?? 0,
        };
        const w = window as unknown as { __focusPanelLayoutSource?: unknown; __focusPanelLayoutLog?: unknown[] };
        w.__focusPanelLayoutSource = entry;
        (w.__focusPanelLayoutLog ||= []).push(entry);
    }, [isSummary, publishedDoc, publishedLayout, activeDoc]);


    // Cross-card handoff orchestration: a referencing card (e.g. Readiness) asks an
    // owner card (e.g. Children) to open a Perspective. We record the request with a
    // monotonic nonce, scroll the owner card into view, and let it apply the focus.
    // This is NOT a new primitive — it coordinates existing local perspective state.
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [focusRequest, setFocusRequest] = useState<FocusPanelFocusRequest | null>(null);
    const focusNonceRef = useRef(0);
    // Card-depth history (local Focus Panel state — NOT routing/drawer). Each handoff
    // pushes its source; Back pops and returns to the prior card/focus.
    const depthHistoryRef = useRef<FocusPanelDepthEntry[]>([]);
    const [previousFocus, setPreviousFocus] = useState<FocusPanelDepthEntry | null>(null);

    /**
     * Current Work operational workspace — replaces the summary card grid for the
     * active record (not a centered modal / elevated card). Closed restores cards.
     */
    const [currentWorkWorkspace, setCurrentWorkWorkspace] = useState<FocusPanelCurrentWorkWorkspaceState>({
        open: false,
        intent: null,
    });
    const openCurrentWorkWorkspace = useCallback(
        (intent: FocusPanelCurrentWorkWorkspaceIntent | null = { kind: "drill_in" }) => {
            setCurrentWorkWorkspace({ open: true, intent: intent ?? { kind: "drill_in" } });
        },
        [],
    );
    const closeCurrentWorkWorkspace = useCallback(() => {
        setCurrentWorkWorkspace({ open: false, intent: null });
    }, []);
    const clearCurrentWorkWorkspaceIntent = useCallback(() => {
        setCurrentWorkWorkspace((prev) => (prev.intent ? { ...prev, intent: null } : prev));
    }, []);
    useEffect(() => {
        // Leaving Work/summary for Activity must restore identity-card composition later.
        if (mode !== "summary" && mode !== "work") {
            setCurrentWorkWorkspace({ open: false, intent: null });
        }
    }, [mode]);
    // Attention identity (queue row / subject), not resolved family opportunity id.
    // Child Waitlist truth enrichment often flips drawerId process-instance → family
    // opportunity without changing Attention — resetting on drawerId was closing
    // Current Work mid-open (Message / Tour Invitation composer vanishing).
    // Skip the initial mount: ModeGrid remounts on context enrich, and a mount-time
    // reset was collapsing a just-opened workspace before the composer could paint.
    const attentionSubjectId = model.subject.id;
    const prevAttentionSubjectIdRef = useRef<string | null>(null);
    useEffect(() => {
        const prev = prevAttentionSubjectIdRef.current;
        prevAttentionSubjectIdRef.current = attentionSubjectId;
        if (prev == null || prev === attentionSubjectId) return;
        setCurrentWorkWorkspace({ open: false, intent: null });
    }, [attentionSubjectId]);

    // In-panel depth layer: a card reports when it opens deep (focused / edit). The
    // host raises that card and recedes the rest — no route, no drawer, no modal.
    // Declared before requestFocus so Linked-card opens can elevate immediately.
    const [activeDepth, setActiveDepth] = useState<FocusPanelActiveDepth | null>(null);

    const emitFocus = useCallback((card: FocusPanelCardKey, focus: string | null) => {
        focusNonceRef.current += 1;
        setFocusRequest({ card, focus, nonce: focusNonceRef.current });
        if (typeof window !== "undefined") {
            window.requestAnimationFrame(() => {
                const target = gridContainerRef.current?.querySelector(
                    `[data-focus-panel-grid-cell="${card}"]`,
                );
                target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
        }
    }, []);

    // ── SELECTION-REQUESTED CARD + ITEM FOCUS ──
    //
    // A caller (today: Search) asks for a specific card, and often a specific row inside it, through
    // the kernel's ASPECT attention — the same movement that carried the subject. Clicking a child
    // therefore lands on Children with that child selected, rather than on the panel's default
    // composition, and the caller never touches the DOM or owns a second focus state: this drives the
    // existing `activeDepth`/`elevatedCellKey` machinery and the existing `focusRequest` the cards
    // already consume.
    //
    // `emitFocus` is what carries the ITEM. Elevating the card alone was the gap: the panel opened
    // Children and left the operator to find the child themselves.
    //
    // Keyed on the REQUEST identity (subject + card + item) so a rapid subject switch re-applies,
    // while a re-render for any other reason does not fight an operator who has since focused
    // something else themselves.
    const requestedFocusKey = requestedCardFocus
        ? `${requestedCardFocus.subject_key ?? ""}:${requestedCardFocus.card_key}:${requestedCardFocus.item_id ?? ""}`
        : null;
    const appliedFocusKeyRef = useRef<string | null>(null);
    /**
     * The card whose elevation came from OUTSIDE the panel and which has not yet reported an elevated
     * level of its own. Null at every other time — this protects exactly one transition, never a
     * persistent state, so the operator can always collapse the card afterwards.
     */
    const requestedElevationCardRef = useRef<FocusPanelCardKey | null>(null);
    useEffect(() => {
        if (!requestedCardFocus || !requestedFocusKey) return;
        if (appliedFocusKeyRef.current === requestedFocusKey) return;
        const card = requestedCardFocus.card_key;
        if (!(FOCUS_PANEL_CARD_KEYS as readonly string[]).includes(card)) return;
        appliedFocusKeyRef.current = requestedFocusKey;
        // The elevation was asked for from OUTSIDE the panel, so the target card has not taken
        // ownership of it yet. Until it does, its own mount-time "base" report must not tear the
        // elevation back down — see `reportPerspective`.
        requestedElevationCardRef.current = card as FocusPanelCardKey;
        setActiveDepth({ card: card as FocusPanelCardKey, level: "focused" });
        const item = (requestedCardFocus.item_id ?? "").trim();
        if (item) emitFocus(card as FocusPanelCardKey, item);
    }, [requestedCardFocus, requestedFocusKey, emitFocus]);

    const requestFocus = useCallback<FocusPanelCoordination["requestFocus"]>(
        (card, focus, source) => {
            if (source) {
                depthHistoryRef.current = [...depthHistoryRef.current, source];
                setPreviousFocus(source);
            }
            // Current Work is a full Focus Panel workspace, not a centered elevated card.
            if (card === "current_work") {
                openCurrentWorkWorkspace({ kind: "drill_in" });
                return;
            }
            if (currentWorkWorkspace.open) {
                closeCurrentWorkWorkspace();
            }
            // Linked cards are not in the initial grid — host them as an elevated overlay.
            if (summaryInputs?.visibilityByCardKey.get(card) === "linked") {
                setActiveDepth({ card, level: "focused" });
            }
            emitFocus(card, focus);
        },
        [
            closeCurrentWorkWorkspace,
            currentWorkWorkspace.open,
            emitFocus,
            openCurrentWorkWorkspace,
            summaryInputs?.visibilityByCardKey,
        ],
    );
    const back = useCallback(() => {
        if (currentWorkWorkspace.open) {
            closeCurrentWorkWorkspace();
            return;
        }
        const stack = depthHistoryRef.current;
        const prev = stack[stack.length - 1];
        if (!prev) return;
        depthHistoryRef.current = stack.slice(0, -1);
        setPreviousFocus(depthHistoryRef.current[depthHistoryRef.current.length - 1] ?? null);
        if (prev.card === "current_work") {
            setActiveDepth(null);
            openCurrentWorkWorkspace({ kind: "drill_in" });
            return;
        }
        // Leaving a Linked host for a Visible card must clear the overlay; returning
        // to another Linked card re-hosts it.
        if (summaryInputs?.visibilityByCardKey.get(prev.card) === "linked") {
            setActiveDepth({ card: prev.card, level: "focused" });
        } else {
            setActiveDepth(null);
        }
        emitFocus(prev.card, prev.focus);
    }, [
        closeCurrentWorkWorkspace,
        currentWorkWorkspace.open,
        emitFocus,
        openCurrentWorkWorkspace,
        summaryInputs?.visibilityByCardKey,
    ]);
    const reportPerspective = useCallback<NonNullable<FocusPanelCoordination["reportPerspective"]>>(
        (card, level) => {
            setActiveDepth((prev) => {
                const isLinked = summaryInputs?.visibilityByCardKey.get(card) === "linked";
                if (isElevatedLevel(level)) {
                    // The card has taken ownership of the elevation; it no longer needs protecting
                    // from its own base report.
                    if (requestedElevationCardRef.current === card) requestedElevationCardRef.current = null;
                    // Linked overlays are opened only by requestFocus. Ignore self-reports
                    // that would reopen after dismiss while the card still has local focus.
                    if (isLinked) return prev?.card === card ? { card, level } : prev;
                    return { card, level };
                }
                // Linked host: ignore mount-time "base" (focus applies in an effect).
                // dismiss() clears activeDepth explicitly after the close animation.
                if (isLinked && prev?.card === card) return prev;
                // EXTERNALLY REQUESTED elevation: ignore this card's mount-time "base" for the same
                // reason the linked host does. A selection request (Search, a deep link) elevates a
                // card the operator has not interacted with; the card then mounts, has nothing
                // selected of its own, and honestly reports "base" — which cleared the elevation the
                // request had just set. Measured: a card-focus request carrying an ITEM survived
                // (selecting the item makes the card report an elevated level), and the identical
                // request WITHOUT an item was torn down between frames, so "open the Household card"
                // did nothing while "open Jane" worked.
                if (requestedElevationCardRef.current === card && prev?.card === card) return prev;
                // Receding/leaving: only clear if this card owned the active layer.
                return prev?.card === card ? null : prev;
            });
        },
        [summaryInputs?.visibilityByCardKey],
    );
    // Return-to-base: backdrop click / ESC asks the active card to collapse. To play
    // the reverse-zoom, we hold the card elevated for one depth duration (`closing`)
    // BEFORE resetting it — so the focused card flies back to its cell instead of
    // snapping. After the window the card resets; dismiss clears activeDepth (Linked
    // hosts ignore "base" reports, so the host must clear depth explicitly).
    const [dismissed, setDismissed] = useState<FocusPanelDismissSignal | null>(null);
    const [closing, setClosing] = useState(false);
    const dismissNonceRef = useRef(0);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dismiss = useCallback<NonNullable<FocusPanelCoordination["dismiss"]>>((card) => {
        if (closeTimerRef.current) return; // already closing — ignore repeat dismiss
        // The operator is collapsing the card, so the externally-requested elevation is over. Without
        // this the guard in `reportPerspective` would refuse the card's base report and the card
        // could not be closed.
        if (requestedElevationCardRef.current === card) requestedElevationCardRef.current = null;
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            dismissNonceRef.current += 1;
            setDismissed({ card, nonce: dismissNonceRef.current });
            setClosing(false);
            setActiveDepth((prev) => (prev?.card === card ? null : prev));
            // Returning to the base panel ends the handoff chain.
            depthHistoryRef.current = [];
            setPreviousFocus(null);
        }, FOCUS_PANEL_DEPTH_MS);
    }, []);
    useEffect(
        () => () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        },
        [],
    );
    // Edit seam (Household V1): a separate injected save capability (NOT a write on
    // the read-only Operational Context). Persists via the existing person PATCH path
    // and broadcasts the existing record-patch events → VM merge → context recompose.
    const recordRef = useRef(record);
    recordRef.current = record;
    const mutation = useMemo(
        () =>
            buildOpportunityFocusPanelMutation({
                canMutate,
                opportunityId: drawerId,
                truth: record,
                getTruth: () => recordRef.current,
            }),
        [canMutate, drawerId, record],
    );

    // ESC: return the focused/edit card to base (Current Work now elevates via activeDepth,
    // so it dismisses through the same animated path). Captured before the drawer's ESC-to-close
    // so depth dismisses without closing the record.
    useEffect(() => {
        if (!currentWorkWorkspace.open && !activeDepth) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // Capture beats the drawer (an OUTER layer) by design — but it also beats every INNER
            // layer, so an open select menu, Radix menu or inline field editor would be collapsed
            // along with the card by one keypress. Yield to whichever is open; it closes itself.
            if (hasInnerDismissibleLayer(document)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (activeDepth) {
                dismiss(activeDepth.card);
                return;
            }
            if (currentWorkWorkspace.open) closeCurrentWorkWorkspace();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [activeDepth, closeCurrentWorkWorkspace, currentWorkWorkspace.open, dismiss]);

    /** cellKey (instance) → { typeKey, config } for model + config resolution. */
    const legacyCellResolution = useMemo(() => {
        const map = new Map<string, { typeKey: FocusPanelCardKey; config: FocusPanelCardConfig | null }>();
        grid.rows.forEach((row) => {
            row.cells.forEach((cell) => {
                const cellKey = cell.instanceKey ?? cell.key;
                map.set(cellKey, {
                    typeKey: cell.key as FocusPanelCardKey,
                    config: instanceMap.get(cellKey)?.config ?? null,
                });
            });
        });
        return map;
    }, [grid, instanceMap]);
    const cellResolution = isSummary ? summaryInputs!.cellResolution : legacyCellResolution;
    const elevatedCellKey = useMemo(
        () => resolveElevatedCellKey(activeDepth?.card ?? null, cellResolution),
        [activeDepth?.card, cellResolution],
    );

    const legacyGridRows = useMemo(
        () =>
            grid.rows
                .map((row) => ({
                    // Configuration-driven: every configured cell is present; readiness decides content.
                    cells: row.cells.map((cell) => ({
                        key: cell.instanceKey ?? cell.key,
                        span: cell.span,
                        density: cell.density,
                    })),
                }))
                .filter((row) => row.cells.length > 0),
        [grid],
    );
    const gridRows = isSummary ? summaryInputs!.gridRows : legacyGridRows;

    /*
     * REPORT WHAT THIS PANEL ACTUALLY PLACES, so readiness can be measured as the operator sees it.
     *
     * Derived from the SAME two values `renderCell` uses — the rendered rows and the cell resolution
     * — so participation cannot drift from what is on screen, and no second composition is computed
     * for telemetry. Linked and hidden cards are already absent from `gridRows`, so a navigable card
     * that occupies no initial cell correctly does not count as visible readiness.
     */
    const placedCardKeys = useMemo(
        () =>
            gridRows.flatMap((row) =>
                row.cells.map((cell) => (cellResolution.get(cell.key)?.typeKey ?? cell.key) as FocusPanelCardKey),
            ),
        [gridRows, cellResolution],
    );
    useEffect(() => {
        setFocusPanelCardParticipation(model.subject.id, placedCardKeys);
    }, [model.subject.id, placedCardKeys]);

    const focusTargets = useMemo(() => {
        const set = new Set<FocusPanelCardKey>();
        // Only READY cards can receive focus; reserved/not-applicable cells hold geometry only.
        for (const row of gridRows) {
            for (const cell of row.cells) {
                const typeKey = (cellResolution.get(cell.key)?.typeKey ?? cell.key) as FocusPanelCardKey;
                if (cardReadiness.get(typeKey) === "ready") set.add(typeKey);
            }
        }
        if (publishedLayout) {
            for (const cardKey of publishedLayoutReadingOrder(publishedLayout)) {
                const typeKey = cardKey as FocusPanelCardKey;
                if (cardReadiness.get(typeKey) === "ready") set.add(typeKey);
            }
        }
        // Linked cards are navigable destinations even though they are not in the initial grid.
        for (const linkedKey of summaryInputs?.linkedCardKeys ?? []) {
            if (cardReadiness.get(linkedKey) === "ready") set.add(linkedKey);
        }
        return set;
    }, [gridRows, cellResolution, cardReadiness, publishedLayout, summaryInputs?.linkedCardKeys]);

    const resolveCommsAction = useCallback(
        () => resolveCommunicationsComposerAction(commands),
        [commands],
    );

    const coordination = useMemo<FocusPanelCoordination>(
        () => ({
            focusTargets,
            openFocusPanelMode: onModeChange,
            invokeHeaderAction: onHeaderAction,
            resolveCommunicationsComposerAction: resolveCommsAction,
            currentWorkWorkspace,
            openCurrentWorkWorkspace,
            closeCurrentWorkWorkspace,
            clearCurrentWorkWorkspaceIntent,
            request: focusRequest,
            requestFocus,
            activeDepth,
            reportPerspective,
            dismissed,
            dismiss,
            previousFocus,
            back,
        }),
        [
            focusTargets,
            onModeChange,
            onHeaderAction,
            resolveCommsAction,
            currentWorkWorkspace,
            openCurrentWorkWorkspace,
            closeCurrentWorkWorkspace,
            clearCurrentWorkWorkspaceIntent,
            focusRequest,
            requestFocus,
            activeDepth,
            reportPerspective,
            dismissed,
            dismiss,
            previousFocus,
            back,
        ],
    );

    // Composition Engine input — Summary is COMPOSED from card semantics (lanes /
    // stack), not laid out as equal grid cells. Reading order + visibility stay
    // config-driven (gridRows); the engine owns grouping + width. Work and other
    // modes keep the legacy responsive grid.
    const composeCards: CompositionCardInput[] | null = isSummary ? summaryInputs!.composeCards : null;

    // Composition overrides (Experience Builder): per-card weight / row / depth the
    // published Surface Definition declared, fed to the engine so the operator surface
    // composes per config. Keyed by card type; platform defaults fill the rest.
    const compositionOverrides = isSummary ? summaryInputs!.compositionOverrides : undefined;

    if (mode === "activity") {
        return (
            <OpportunityFocusPanelEmbeddedWorkspace
                drawerId={drawerId}
                record={record}
                communicationsPreview={operationalContext.communicationsPreview ?? null}
                onSelectTab={onSelectTab}
            />
        );
    }

    // Slice A: Current Work no longer replaces the canvas. When opened it elevates as a
    // top-pinned Focus Card through the standard activeDepth/elevatedCellKey path below — its
    // grid cell reports "focused" and FocusPanelCardGrid raises it (backdrop + top-aligned).

    // Linked cards are not in the Visible grid — when focused, host them in a transient
    // top-pinned overlay (same workspace feel; does not permanently insert into layout).
    const linkedHostCard =
        activeDepth
        && summaryInputs?.visibilityByCardKey.get(activeDepth.card) === "linked"
            ? activeDepth.card
            : null;
    const linkedHostModel = linkedHostCard ? cards.get(linkedHostCard) : null;
    const linkedHostResolution = linkedHostCard
        ? cellResolution.get(linkedHostCard) ?? { typeKey: linkedHostCard, config: null }
        : null;

    return (
        <div
            ref={gridContainerRef}
            id={`focus-panel-mode-${mode}`}
            role="tabpanel"
            aria-labelledby={`focus-panel-mode-tab-${mode}`}
            data-focus-panel-mode={mode}
            data-focus-panel-work-state={mode === "work" && workflowActive ? "active" : undefined}
            {...alloySectionDomAttrs(mode === "work" ? "WU-10" : "WU-09")}
        >
            <FocusPanelCardGrid
                rows={gridRows}
                publishedLayout={publishedLayout}
                preferLanesFromGrid={Boolean(publishedLayout?.grid) || mode === "work"}
                composeCards={composeCards}
                compositionOverrides={compositionOverrides}
                className={mode === "work" ? "alloy-os-focus-panel-grid--work" : undefined}
                dataFocusPanelSplitLayout={mode === "work" ? "true" : undefined}
                elevatedCellKey={linkedHostCard ? null : elevatedCellKey}
                closing={closing}
                onBackdropClick={() => {
                    if (activeDepth) dismiss(activeDepth.card);
                }}
                renderCell={(key) => {
                    const resolution = cellResolution.get(key);
                    const typeKey = (resolution?.typeKey ?? key) as FocusPanelCardKey;
                    // Configuration-driven composition: a configured cell is ALWAYS present. Readiness
                    // decides content — reserved / not_applicable hold the cell's geometry (settlement
                    // fills in place) and NEVER remove it.
                    const readiness = cardReadiness.get(typeKey) ?? "reserved";
                    const baseModel = cards.get(typeKey);
                    if (readiness !== "ready" || !baseModel) {
                        // Once the surface declares `phase === "settled"`, any card still not ready —
                        // `not_applicable`, or simply never produced for this record — is RESOLVED-empty,
                        // not loading. In the `commit` phase a not-ready card is genuinely still settling →
                        // the calm reserve. This stops a resolved card from appearing to load forever.
                        // Read the DECLARED phase, never the producer's name (`model.source` is diagnostic).
                        /**
                         * An EXPLICIT `reserved` outranks the phase inference.
                         *
                         * The phase rule exists for cards the surface never produced: once settled,
                         * a still-not-ready card is resolved-empty, so it cannot appear to load
                         * forever. But a card explicitly marked `reserved` is a positive statement
                         * that THIS cell is settling for the current subject — a child mission
                         * whose subject just changed. Treating that as resolved-empty asserts "this
                         * child has no What's Next", which is false while it is still arriving.
                         *
                         * `has()` is what separates the two: an absent key defaults to "reserved"
                         * above, and those must keep the resolved-empty treatment.
                         */
                        const explicitlyReserved =
                            cardReadiness.has(typeKey) && cardReadiness.get(typeKey) === "reserved";
                        const settled =
                            readiness === "not_applicable"
                            || (model.phase === "settled" && !explicitlyReserved);
                        return <ReservedFocusPanelCell typeKey={typeKey} settled={settled} />;
                    }
                    const cardModel = composeEffectiveCardModel(baseModel, resolution?.config ?? null, record);
                    const receded = mode === "work" && workflowActive && typeKey === "work_launcher";
                    return (
                        <FocusPanelCardRenderer
                            model={cardModel}
                            context={operationalContext}
                            focusPanelMode={mode}
                            onPrimaryAction={(actionKey) => {
                                if (actionKey === "primary_next_action" && commands[0]) {
                                    onHeaderAction?.(commands[0]);
                                }
                            }}
                            receded={receded}
                            coordination={coordination}
                            mutation={mutation}
                            compat={{ onSelectTab }}
                        />
                    );
                }}
            />
            {linkedHostCard && linkedHostModel && linkedHostResolution ?
                <div
                    className="alloy-os-focus-panel-linked-host"
                    data-fp-linked-host="true"
                    data-fp-elevated="true"
                    data-fp-closing={closing ? "true" : undefined}
                >
                    <button
                        type="button"
                        className="alloy-os-focus-panel-linked-host__backdrop"
                        aria-label="Close linked card"
                        onClick={() => dismiss(linkedHostCard)}
                    />
                    <div
                        className="alloy-os-focus-panel-linked-host__card"
                        data-focus-panel-grid-cell={linkedHostCard}
                    >
                        <FocusPanelCardRenderer
                            model={composeEffectiveCardModel(
                                linkedHostModel,
                                linkedHostResolution.config,
                                record,
                            )}
                            context={operationalContext}
                            focusPanelMode={mode}
                            coordination={coordination}
                            mutation={mutation}
                            compat={{ onSelectTab }}
                        />
                    </div>
                </div>
            :   null}
        </div>
    );
}
