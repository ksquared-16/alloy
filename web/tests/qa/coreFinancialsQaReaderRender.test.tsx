// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CoreFinancialsQaReader from "@/app/dev/core-financials-qa/CoreFinancialsQaReader";

/**
 * THE WALK, RENDERED — not grepped.
 *
 * Every earlier guard on this surface read the file and asserted a string was in it. That cannot
 * tell a scenario the Director can reach from one the component filters out three lines later,
 * which is exactly the defect this suite exists to catch: nine suite-certified Autopay scenarios
 * were present in the catalog, served by the route, named in the source — and absent from the walk.
 *
 * So this mounts the component against a stubbed route response and asks the DOM.
 */

const scenario = (over: Record<string, unknown>) => ({
    key: "k", order: 1, title: "T", purpose: "P", whyItMatters: "W",
    navigate: ["go"], doThis: ["do"], expectChanges: ["c"], expectUnchanged: ["u"],
    invariant: "i", failSymptoms: ["s"], disposition: "HUMAN_WALKTHROUGH",
    ...over,
});

/* One of each disposition, plus one the walk must NOT reach. */
const PAYLOAD = {
    suiteKey: "core_financials_director_qa",
    catalogVersion: "test.1",
    environment: "local",
    deployedRevision: "abcdef0123456789",
    subject: {
        resolved: true, unresolvedReason: null, householdLabel: "Certhouse",
        periodKey: "2026-09", periodLabel: "September 2026",
        outstandingCents: 3700, collectibleCents: 3700,
        namedParties: ["Bo Certopp"], expectedFunding: [],
        postedCount: 1, draftCount: 0, reductionCount: 0, paymentCount: 1,
        billableChildren: [{ customerMemberId: "m1", displayName: "Kid" }],
    },
    navigation: {
        reachable: true, unreachableReason: null, surface: "Financials",
        accountsInCohort: 1, truncated: false,
    },
    scenarios: [
        scenario({
            key: "human_one", order: 1, title: "A human act",
            evidence: ["HUMAN_WALKTHROUGH", "REAL_STRIPE_TEST_ACT"],
        }),
        scenario({
            key: "autopay_certified", order: 2, title: "Autopay already certified",
            disposition: "AUTOMATED_CERTIFIED_HUMAN_PENDING",
            evidence: ["AUTOMATED_CERTIFIED"],
        }),
        scenario({
            key: "provider_return", order: 3, title: "A provider return",
            disposition: "EXPLICITLY_DEFERRED",
            evidence: ["DEFERRED_PROVIDER_DEPENDENT"],
        }),
        scenario({ key: "not_in_walk", order: 4, title: "Out of scope here", disposition: "OUT_OF_SCOPE" }),
    ],
    readiness: [],
    results: [],
    noAutomaticPass: "A suite behind a scenario is evidence, never an acceptance.",
    evidenceBoundaries: [
        { key: "return_boundary", scenarioKey: "provider_return", statement: "No return can be manufactured on a shared provider account." },
    ],
    fixtureDoctrine: [
        { fixture: "Certhouse", rule: "READ ONLY", why: "It IS the certification." },
    ],
    baselineChanged: false,
    priorRevisions: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true, status: 200, json: async () => PAYLOAD,
    })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

async function mount() {
    await act(async () => { root.render(<CoreFinancialsQaReader />); });
    /* The route read happens in an effect; let its microtasks settle. */
    await act(async () => { await Promise.resolve(); });
}

const html = () => container.innerHTML;
const click = async (selector: string) => {
    const el = container.querySelector<HTMLElement>(selector);
    expect(el, `missing ${selector}`).not.toBeNull();
    await act(async () => { el!.click(); });
};

describe("the walk a Director is actually offered", () => {
    it("includes the suite-certified scenario the old filter removed", async () => {
        await mount();
        /*
         * Three of the four scenarios belong to the walk. The fourth is out of scope, and the
         * denominator has to show both numbers or the walk reads as the whole catalog.
         */
        const progress = container.querySelector('[data-qa-progress="true"]')!.textContent ?? "";
        expect(progress).toContain("0 / 3");
        expect(progress).toContain("1 not in this walk");
        expect(progress).toContain("deferred");
    });

    it("states the rule and the fixture doctrine before the first scenario", async () => {
        await mount();
        expect(html()).toContain("never an acceptance");
        expect(container.querySelector('[data-qa-fixture-doctrine="true"]')).not.toBeNull();
        expect(container.querySelector('[data-qa-fixture="Certhouse"]')!.textContent).toContain("READ ONLY");
    });

    it("reaches the certified scenario by walking, not only by counting", async () => {
        await mount();
        await click('[data-qa-start="true"]');
        /* Scenario 1, then forward to the one the old filter hid. */
        expect(container.querySelector("[data-qa-scenario]")!.getAttribute("data-qa-scenario")).toBe("human_one");
    });
});

describe("what a scenario costs, and where engineering stopped", () => {
    it("names the evidence classes on the scenario in view", async () => {
        await mount();
        await click('[data-qa-start="true"]');
        const classes = [...container.querySelectorAll("[data-qa-evidence-class]")]
            .map((n) => n.getAttribute("data-qa-evidence-class"));
        expect(classes).toContain("REAL_STRIPE_TEST_ACT");
        /* In the Director's words, not the enum's. */
        expect(container.querySelector('[data-qa-evidence="true"]')!.textContent).toContain("real Stripe TEST act");
    });

    it("offers deferred as an answer distinct from blocked", async () => {
        await mount();
        await click('[data-qa-start="true"]');
        for (const id of ["record-pass", "record-fail", "record-blocked", "record-deferred", "record-not-run"]) {
            expect(container.querySelector(`[data-testid="${id}"]`), id).not.toBeNull();
        }
    });

    it("keeps the notes that make this a human QA surface", async () => {
        await mount();
        await click('[data-qa-start="true"]');
        expect(container.querySelector('[data-qa-observation="true"]')).not.toBeNull();
        expect(container.querySelector("#qa-expected")).not.toBeNull();
        expect(container.querySelector('[data-qa-classification="true"]')).not.toBeNull();
        expect(html()).toContain("survive a reload");
    });
});
