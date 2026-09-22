/** @vitest-environment jsdom */
/**
 * THE CHAIN THAT COULD NOT SPEAK WHERE IT MATTERED.
 *
 * The Focus Panel commit chain already recorded destination commit, the commit-critical model, each
 * card becoming ready, and settlement. All of it was gated on `perceivedMarksEnabled()`, which is
 * `NODE_ENV !== "production"` — so on deployed staging, the only build the programme measures, it
 * emitted nothing at all. Three separate gating edges were then proposed from HTTP response timing
 * and all three were refuted. This certifies the chain that replaces that guessing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    chainDiag,
    chainRecordingEnabled,
    markFocusPanelDestinationCommit,
    resetCommitChainForSubject,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCommitTiming";
import { markFocusPanelWorkModeModel, setFocusPanelCardParticipation } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardReadinessTiming";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/** The route-timing seed is the EXISTING opt-in; its presence is what enables recording. */
function enableDiagnostic(on: boolean): void {
    document.body.innerHTML = on ? '<script id="__alloy_route_timing" type="application/json">{}</script>' : "";
}

const SUBJ_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SUBJ_C = "cccccccc-0000-4000-8000-000000000003";

function model(
    subjectId: string,
    ready: string[],
    source: "provisioning_answer" | "drawer_vm" = "provisioning_answer",
): FocusPanelWorkModeModel {
    const cardReadiness = new Map<string, string>();
    for (const k of ready) cardReadiness.set(k, "ready");
    return {
        subject: { id: subjectId },
        source,
        cardReadiness,
    } as unknown as FocusPanelWorkModeModel;
}

beforeEach(() => {
    (window as unknown as { __alloyFocusChain?: unknown }).__alloyFocusChain = undefined;
    enableDiagnostic(true);
    resetCommitChainForSubject(SUBJ_A);
});

describe("recording gate — the whole point of this slice", () => {
    /*
     * Simulating a deployed build takes BOTH stubs. `perfDevDetailEnabled()` is
     * `NODE_ENV !== "production" || VITEST === "true"`, so under vitest the second clause keeps dev
     * marks on however NODE_ENV is set — stubbing NODE_ENV alone proves nothing about deployed.
     */
    const asDeployedBuild = (fn: () => void) => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("VITEST", "");
        try { fn(); } finally { vi.unstubAllEnvs(); }
    };

    it("records when the route-timing diagnostic is on, even in a production build", () => {
        asDeployedBuild(() => {
            enableDiagnostic(true);
            expect(chainRecordingEnabled(), "must record on deployed when diagnostics are on").toBe(true);
        });
    });

    it("records nothing when the diagnostic is off in a production build", () => {
        asDeployedBuild(() => {
            enableDiagnostic(false);
            expect(chainRecordingEnabled(), "must stay silent on deployed by default").toBe(false);
        });
    });

    it("dev behaviour is unchanged — recording without any diagnostic opt-in", () => {
        enableDiagnostic(false);
        expect(chainRecordingEnabled()).toBe(true);
    });
});

describe("readiness completeness and ordering", () => {
    it("records a flip for every card that becomes ready (defect A)", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials", "attendance", "health_safety"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials", "attendance", "health_safety"]));
        const keys = (chainDiag()?.flips ?? []).map((f) => f.key).sort();
        expect(keys).toEqual(["attendance", "financials", "health_safety"]);
    });

    it("does not record a card the composition never placed (defect B)", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials", "attendance"]));
        const keys = (chainDiag()?.flips ?? []).map((f) => f.key);
        // `attendance` has a ready MODEL but no placed cell — it is not a ready CARD.
        expect(keys).toEqual(["financials"]);
    });

    it("records each key once, so a flip cannot be detached from a real transition (defect C)", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        expect((chainDiag()?.flips ?? []).filter((f) => f.key === "financials")).toHaveLength(1);
    });

    it("eligibility is the commit-critical model, and never precedes the first flip it enables (defect D)", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        const d = chainDiag()!;
        expect(d.eligibleAt, "eligible must be set by the commit-critical model").not.toBeNull();
        expect(d.modelAt).toBe(d.eligibleAt);
        for (const f of d.flips) expect(f.at).toBeGreaterThanOrEqual(d.eligibleAt as number);
    });

    it("an enriched (drawer_vm) model settles but never sets eligibility (defect D)", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"], "drawer_vm"));
        const d = chainDiag()!;
        expect(d.eligibleAt, "settlement is not eligibility").toBeNull();
        expect(d.settledAt).not.toBeNull();
    });
});

describe("destination generation (defect F)", () => {
    it("binds every flip to the destination it belongs to", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        expect((chainDiag()?.flips ?? []).every((f) => f.generation === SUBJ_A)).toBe(true);
    });

    it("a new destination starts a fresh chain, so A's flips cannot be read as C's", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        expect(chainDiag()!.flips).toHaveLength(1);

        // Operator moves to C. A's chain must not carry forward.
        setFocusPanelCardParticipation(SUBJ_C, ["attendance"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_C, ["attendance"]));
        const d = chainDiag()!;
        expect(d.generation).toBe(SUBJ_C);
        expect(d.flips.every((f) => f.generation === SUBJ_C), "no A flip may survive into C").toBe(true);
        expect(d.flips.map((f) => f.key)).toEqual(["attendance"]);
    });
});

describe("destination commit is the chain epoch (SUMMARY_READINESS_START)", () => {
    it("resets the diagnostic and stamps a start", () => {
        setFocusPanelCardParticipation(SUBJ_A, ["financials"] as never);
        markFocusPanelWorkModeModel(model(SUBJ_A, ["financials"]));
        expect(chainDiag()!.flips).toHaveLength(1);
        markFocusPanelDestinationCommit();
        const d = chainDiag()!;
        expect(d.startAt, "the epoch must be stamped").not.toBeNull();
        expect(d.flips, "a new epoch starts with no flips").toHaveLength(0);
    });
});
