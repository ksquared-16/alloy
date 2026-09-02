/**
 * READINESS MUST BE REPORTED UNDER A RUNTIME IDENTITY, NOT A RETIRED ONE.
 *
 * The Focus Panel resolves every composed cell through `normalizeFocusPanelCardKey`, and
 * SUPERSESSION OUTRANKS EXACT MATCH there: a stored `current_work` becomes `business_process`
 * before any cell exists. `current_work` is superseded on EVERY grain, so no composition — not a
 * tenant's published doc, not the platform's own default doc — can produce a cell that answers to
 * it.
 *
 * The commit producer nevertheless admits it to the ready set and the certification chain emits it
 * as a ready card. That is the dormant-commit-critical-work defect the participation guard exists
 * to catch, and that guard misses it because it compares against the RAW default composition
 * instead of the composition as the runtime resolves it.
 *
 * The consequence is measurement integrity, which is why this is pinned here rather than left as a
 * note: `focus_panel_chain:model_commit_critical.ready_count` and `focus_panel_chain:card_ready`
 * are the series the Grade-A protocol reads. Counting a card no cell can render overstates
 * operator-visible readiness at commit.
 *
 * These tests name `current_work` because it is the concrete instance, but every assertion is
 * driven by the REGISTRY's supersession concern — a future supersession inherits them.
 */
import { describe, expect, it, vi } from "vitest";

import { COMMIT_CRITICAL_CARD_SPECS } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitCriticalCards";
import { cardSuccessor } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import { buildFocusPanelSummaryDefaultDoc } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { markFocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";
import { focusPanelCardBackLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/** A commit-critical model whose ready set is exactly `ready`. Only the marked fields are read. */
function modelWithReady(subjectId: string, ready: readonly FocusPanelCardKey[]): FocusPanelWorkModeModel {
    return {
        source: "provisioning_answer",
        subject: { id: subjectId },
        cardReadiness: new Map(ready.map((k) => [k, "ready" as const])),
    } as unknown as FocusPanelWorkModeModel;
}

/**
 * Run `markFocusPanelWorkModeModel` and capture what the chain emitted.
 *
 * `emitPerf` logs through `console.warn`, and the spy's calls MUST be read before `mockRestore`,
 * which resets them — reading after is how this test first reported an empty chain.
 */
function chainEmissions(model: FocusPanelWorkModeModel): Array<Record<string, unknown>> {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls: unknown[][];
    try {
        markFocusPanelWorkModeModel(model);
    } finally {
        calls = warn.mock.calls.map((call) => [...call]);
        warn.mockRestore();
    }
    return calls
        .map((call) => call[1] as Record<string, unknown> | undefined)
        .filter((p): p is Record<string, unknown> => !!p);
}

/** Just the payloads for one chain event. */
function eventsOf(emissions: Array<Record<string, unknown>>, event: string) {
    return emissions.filter((p) => p.event === event);
}

/** Every card TYPE a composed cell can actually resolve to, as the runtime resolves it. */
function renderableTypeKeys(): Set<string> {
    const inputs = deriveFocusPanelSummaryCompositionInputs(buildFocusPanelSummaryDefaultDoc());
    return new Set(Array.from(inputs.cellResolution.values()).map((r) => r.typeKey));
}

describe("superseded card identities and commit readiness", () => {
    it("the default composition still NAMES the retired key — this is the trap", () => {
        // Not a bug on its own: the doc builder is allowed to carry the historical key, because
        // normalization is what gives it a runtime identity. It is only a trap for any guard that
        // reads this list WITHOUT normalizing, which is precisely what the participation test did.
        expect(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((e) => e.key)).toContain("current_work");
    });

    it("no composed cell resolves to a globally superseded key", () => {
        const renderable = renderableTypeKeys();
        const superseded = Array.from(renderable).filter((key) => cardSuccessor(key) !== null);
        expect(
            superseded,
            `These card types are placed on cells yet are superseded on every grain, so the ` +
                `renderer will ask for a successor the producers may never key: ${superseded.join(", ")}`,
        ).toEqual([]);
    });

    it("`current_work` renders on NO cell — its successor holds the placement", () => {
        const renderable = renderableTypeKeys();
        expect(cardSuccessor("current_work")).toBe("business_process");
        expect(renderable.has("current_work")).toBe(false);
        expect(renderable.has("business_process")).toBe(true);
    });

    it("the certification chain does not report a retired identity as a ready card", () => {
        // BEHAVIOURAL, not structural. The producer is allowed to key `current_work` — it stays a
        // canonical data owner and other consumers read its model. What must not happen is the
        // Grade-A series counting it, because no cell can render it.
        const emissions = chainEmissions(
            modelWithReady("subject-superseded-1", ["current_work", "household", "children"]),
        );
        const commit = eventsOf(emissions, "model_commit_critical");
        const cardReady = eventsOf(emissions, "card_ready");

        // Two renderable cards were ready; the retired identity is not one of them.
        expect(commit).toHaveLength(1);
        expect(commit[0].ready_count).toBe(2);
        expect(cardReady.map((p) => p.card_key).sort()).toEqual(["children", "household"]);
        expect(cardReady.map((p) => p.card_key)).not.toContain("current_work");
    });

    it("a GRAIN-SCOPED supersession is still reported — it renders on every other grain", () => {
        // Employment is superseded by Staff on `person` only, so it remains a real card an operator
        // sees on a case. Excluding it would under-report readiness, which is the opposite defect.
        expect(cardSuccessor("employment")).toBeNull();
        expect(cardSuccessor("employment", "person")).toBe("staff");

        const emissions = chainEmissions(modelWithReady("subject-superseded-2", ["employment"]));
        expect(eventsOf(emissions, "card_ready").map((p) => p.card_key)).toEqual(["employment"]);
    });
});

/**
 * The back affordance is a CARD NAME, and card names are a registry concern. This pins the
 * migration of the last central label list in the shared coordination runtime.
 */
describe("back-label reads the registry, not a central list", () => {
    it("every label the old switch returned is unchanged", () => {
        // Byte-for-byte the five cases the switch enumerated, so no existing affordance moves.
        expect(focusPanelCardBackLabel("household")).toBe("Household");
        expect(focusPanelCardBackLabel("children")).toBe("Children");
        expect(focusPanelCardBackLabel("communications")).toBe("Communications");
        expect(focusPanelCardBackLabel("documents")).toBe("Documents");
        expect(focusPanelCardBackLabel("current_work")).toBe("What's Next");
    });

    it("the successor card is named, where the switch fell through to the generic word", () => {
        // The drift this removes: the panel's largest card read "← Back to panel".
        expect(focusPanelCardBackLabel("business_process")).toBe("Business Process");
    });

    it("a registered card the switch never listed now gets its real name", () => {
        expect(focusPanelCardBackLabel("attendance")).toBe("Attendance");
        expect(focusPanelCardBackLabel("financials")).toBe("Financials");
    });

    it("an unregistered key still falls back to the generic word", () => {
        expect(focusPanelCardBackLabel("not_a_card" as FocusPanelCardKey)).toBe("panel");
    });
});
