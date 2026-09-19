/** @vitest-environment jsdom */
/**
 * METRIC V2.1 — SEMANTIC AUTHORITATIVE FINALITY.
 *
 * V2 asked "was that mutation an animation?" and called everything else authoritative. Deployed
 * evidence showed what that cost: at the render that mounts the participant cards, business_process
 * received only a `data-focus-panel-settlement` rewrite and financials only a
 * `data-financials-subject` rewrite. Neither area's visible truth changed; both had their
 * final-authoritative time reset to that moment. The metric was reporting the last React write.
 *
 * V2.1 asks whether anything an operator can SEE changed. These tests pin the contract from both
 * sides, because the cheap repair — "ignore attribute-only mutations" — is also wrong: a real
 * attribute-only state change (disabled -> enabled, collapsed -> expanded, a styled state
 * attribute) is genuine visible truth and must still count.
 *
 * Every gate here corresponds to a planted defect that must fail it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installVisibleCompletionProbe } from "../../playwright/support/visibleCompletionProbe";

type Section = {
    contentMs: number;
    structureMs: number;
    visibleStateMs: number;
    finalAuthMs: number;
    identicalRerenders: number;
    diagnosticWrites: number;
    anim: number;
};
type V21 = {
    lastBlockingAuthoritativeMs: number;
    finalAuthoritativeMs: number;
    perSection: Record<string, Section>;
    kinds21: Record<string, number>;
};
const v2 = (): V21 => (window as unknown as { __p076v2: V21 }).__p076v2;
const settle = (ms = 12) => new Promise((r) => setTimeout(r, ms));

/** The measured nesting: the container shell wrapping leaf areas that actually paint. */
function surface(areas: string): void {
    document.body.innerHTML = `
        <div data-alloy-section-id="WU-00" data-alloy-section-blocking="true"
             data-alloy-section-container="true" id="shell">${areas}</div>`;
}
const area = (id: string, body = "") =>
    `<div data-alloy-section-id="${id}" data-alloy-section-blocking="true" id="${id}">${body}</div>`;

/**
 * A stylesheet is the product's own statement that an attribute is rendered. The probe reads the
 * live sheets rather than carrying a list, so the tests must give it one to read.
 */
function styleOn(selector: string): void {
    const s = document.createElement("style");
    s.textContent = `${selector} { opacity: 0.5 }`;
    document.head.appendChild(s);
}

beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
});
afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
});

describe("gate A — a same-value attribute rewrite is not new truth", () => {
    it("does not advance finality when React writes the value already there", async () => {
        surface(area("financials", "<p>Balance $420.00</p>"));
        const el = document.getElementById("financials")!;
        el.setAttribute("data-financials-subject", "opp-1");
        installVisibleCompletionProbe();

        el.setAttribute("data-financials-subject", "opp-1"); // identical write
        await settle();

        expect(v2().kinds21.IDENTICAL_RERENDER).toBeGreaterThan(0);
        expect(v2().finalAuthoritativeMs).toBe(-1);
        expect(v2().perSection.financials.identicalRerenders).toBeGreaterThan(0);
    });
});

describe("gate B — a settlement stamp is diagnostic, not truth", () => {
    it("does not advance finality on data-focus-panel-settlement pending -> resolved", async () => {
        surface(area("business_process", "<p>Enrolling</p>"));
        const el = document.getElementById("business_process")!;
        el.setAttribute("data-focus-panel-settlement", "pending");
        installVisibleCompletionProbe();

        el.setAttribute("data-focus-panel-settlement", "resolved"); // value really changed
        await settle();

        expect(v2().kinds21.DIAGNOSTIC_ATTRIBUTE_CHANGE).toBeGreaterThan(0);
        expect(v2().finalAuthoritativeMs).toBe(-1);
        expect(v2().perSection.business_process.diagnosticWrites).toBeGreaterThan(0);
    });
});

describe("gate C — an identity stamp is diagnostic, not truth", () => {
    it("does not advance finality on a data-financials-subject rewrite to a new value", async () => {
        surface(area("financials", "<p>Balance $420.00</p>"));
        const el = document.getElementById("financials")!;
        el.setAttribute("data-financials-subject", "opp-1");
        installVisibleCompletionProbe();

        el.setAttribute("data-financials-subject", "opp-2");
        await settle();

        expect(v2().perSection.financials.diagnosticWrites).toBeGreaterThan(0);
        expect(v2().finalAuthoritativeMs).toBe(-1);
        // OLD V2 is kept computing beside it, and this is exactly where the two disagree.
        expect(v2().lastBlockingAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });
});

describe("gate D — real attribute-only visible truth still counts", () => {
    it("counts a native state change the browser itself renders", async () => {
        surface(area("household", '<button id="act" disabled>Add member</button>'));
        installVisibleCompletionProbe();

        document.getElementById("act")!.removeAttribute("disabled");
        await settle();

        expect(v2().kinds21.AUTHORITATIVE_VISIBLE_STATE_CHANGE).toBeGreaterThan(0);
        expect(v2().perSection.household.visibleStateMs).toBeGreaterThanOrEqual(0);
        expect(v2().finalAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });

    it("counts an accessible state change the operator perceives", async () => {
        surface(area("health_safety", '<div id="p" aria-expanded="false">Allergies</div>'));
        installVisibleCompletionProbe();

        document.getElementById("p")!.setAttribute("aria-expanded", "true");
        await settle();

        expect(v2().perSection.health_safety.visibleStateMs).toBeGreaterThanOrEqual(0);
        expect(v2().finalAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });

    it("counts a data attribute the product's own stylesheet renders", async () => {
        // The discriminating case: same SHAPE as the diagnostic stamps above, opposite verdict,
        // decided only by the product saying it paints. This is why the rule is not "ignore data-*".
        styleOn('[data-schedule-ready="true"]');
        surface(area("attendance", '<div id="sched" data-schedule-ready="false">Schedule</div>'));
        installVisibleCompletionProbe();

        document.getElementById("sched")!.setAttribute("data-schedule-ready", "true");
        await settle();

        expect(v2().perSection.attendance.visibleStateMs).toBeGreaterThanOrEqual(0);
        expect(v2().finalAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });
});

describe("gate E — motion never advances finality", () => {
    it("ignores class, style and aria-busy", async () => {
        surface(area("financials", "<p>Balance $420.00</p>"));
        const el = document.getElementById("financials")!;
        installVisibleCompletionProbe();

        el.setAttribute("class", "card is-settling");
        el.setAttribute("style", "opacity: 1");
        el.setAttribute("aria-busy", "false");
        await settle();

        expect(v2().finalAuthoritativeMs).toBe(-1);
        expect(v2().perSection.financials.anim).toBeGreaterThan(0);
    });
});

describe("gate F — a stale subject cannot satisfy the current destination", () => {
    it("suppresses a semantic change stamped with the previous generation", async () => {
        document.body.innerHTML = `
            <div data-inline-focus-panel-subject="opp-2" id="root">
                <div data-alloy-section-id="WU-00" data-alloy-section-blocking="true"
                     data-alloy-section-container="true">
                    <div data-alloy-section-id="household" data-alloy-section-blocking="true" id="household">
                        <div data-inline-focus-panel-subject="opp-1" id="stale"></div>
                    </div>
                </div>
            </div>`;
        installVisibleCompletionProbe();

        const late = document.createElement("p");
        late.textContent = "Household of the record the operator already left";
        document.getElementById("stale")!.appendChild(late);
        await settle();

        expect(v2().finalAuthoritativeMs).toBe(-1);
    });
});

describe("gate G — a parent rerender does not reset an unchanged child", () => {
    it("keeps an area's finality when React rebuilds an identical subtree", async () => {
        surface(area("financials", '<div id="body"><p>Balance $420.00</p></div>'));
        installVisibleCompletionProbe();

        // Real content arrives once.
        document.getElementById("body")!.appendChild(
            Object.assign(document.createElement("p"), { textContent: "Next payment 1 Oct" }),
        );
        await settle();
        const earned = v2().perSection.financials.finalAuthMs;
        expect(earned).toBeGreaterThanOrEqual(0);

        await settle(25);

        // The parent rerenders: the same subtree leaves and an identical one arrives.
        const host = document.getElementById("financials")!;
        const old = document.getElementById("body")!;
        const rebuilt = old.cloneNode(true) as HTMLElement;
        host.replaceChild(rebuilt, old);
        await settle();

        expect(v2().perSection.financials.identicalRerenders).toBeGreaterThan(0);
        expect(v2().perSection.financials.finalAuthMs).toBe(earned);
        expect(v2().finalAuthoritativeMs).toBe(earned);
    });
});

describe("gate H — the semantic fingerprint ignores what the operator cannot see", () => {
    it("still calls it an identical rerender when only class and diagnostic stamps differ", async () => {
        surface(area("business_process", '<div id="body"><p>Enrolling</p></div>'));
        installVisibleCompletionProbe();

        const host = document.getElementById("business_process")!;
        const old = document.getElementById("body")!;
        const rebuilt = old.cloneNode(true) as HTMLElement;
        rebuilt.setAttribute("class", "rebuilt-by-react");
        rebuilt.setAttribute("data-focus-panel-settlement", "resolved");
        rebuilt.setAttribute("data-alloy-section-cache", "warm");
        host.replaceChild(rebuilt, old);
        await settle();

        expect(v2().perSection.business_process.identicalRerenders).toBeGreaterThan(0);
        expect(v2().finalAuthoritativeMs).toBe(-1);
    });
});

describe("gate I — the semantic fingerprint does not ignore real visible change", () => {
    it("counts a replacement whose visible text differs", async () => {
        surface(area("household", '<div id="body"><p>Loading household</p></div>'));
        installVisibleCompletionProbe();

        const host = document.getElementById("household")!;
        const old = document.getElementById("body")!;
        const next = old.cloneNode(true) as HTMLElement;
        next.querySelector("p")!.textContent = "2 guardians, 1 child";
        host.replaceChild(next, old);
        await settle();

        expect(v2().perSection.household.finalAuthMs).toBeGreaterThanOrEqual(0);
        expect(v2().finalAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });

    it("counts a replacement whose nested input value differs", async () => {
        surface(area("household", '<div id="body"><input id="f" value="" /></div>'));
        installVisibleCompletionProbe();

        const host = document.getElementById("household")!;
        const old = document.getElementById("body")!;
        const next = old.cloneNode(true) as HTMLElement;
        next.querySelector("input")!.setAttribute("value", "Rivera");
        host.replaceChild(next, old);
        await settle();

        expect(v2().finalAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });
});

describe("the deployed specimen — the binding render, replayed", () => {
    /**
     * The exact shape measured on bfcb24680: household gains content, attendance and
     * health_safety exchange subtrees for real ones, and business_process and financials receive
     * nothing but a stamp. Under V2 all five reset finality. Under V2.1 only the first three may.
     */
    it("finalises on the three areas that changed and not on the three that did not", async () => {
        surface([
            area("household", '<div id="hh"><p>Loading</p></div>'),
            area("attendance", '<div id="att" data-attendance-reserved="true"></div>'),
            area("health_safety", '<div id="hs" data-health-reserved="true"></div>'),
            area("business_process", '<div id="bp"><p>Enrolling</p></div>'),
            area("financials", '<div id="fin"><p>Balance $420.00</p></div>'),
            area("billing_preview", '<div id="bill"><p>No assignment on this record to price.</p></div>'),
        ].join(""));
        const bp = document.getElementById("business_process")!;
        const fin = document.getElementById("financials")!;
        bp.setAttribute("data-focus-panel-settlement", "pending");
        fin.setAttribute("data-financials-subject", "opp-1");
        installVisibleCompletionProbe();

        // Real content.
        document.getElementById("hh")!.querySelector("p")!.textContent = "2 guardians, 1 child";
        // Real structure: reserved geometry replaced by the answer.
        for (const [host, id, text] of [
            ["attendance", "att", "Present 4 of 5"],
            ["health_safety", "hs", "No allergies recorded"],
        ] as const) {
            const reserved = document.getElementById(id)!;
            const real = document.createElement("div");
            real.innerHTML = `<p>${text}</p>`;
            document.getElementById(host)!.replaceChild(real, reserved);
        }
        // The stamps, and nothing else.
        bp.setAttribute("data-focus-panel-settlement", "resolved");
        fin.setAttribute("data-financials-subject", "opp-1"); // same value: pure rerender
        await settle();

        const s = v2().perSection;
        expect(s.household.finalAuthMs).toBeGreaterThanOrEqual(0);
        expect(s.attendance.structureMs).toBeGreaterThanOrEqual(0);
        expect(s.health_safety.structureMs).toBeGreaterThanOrEqual(0);

        // The false finality reset must be gone for all three.
        expect(s.business_process.finalAuthMs).toBe(-1);
        expect(s.business_process.diagnosticWrites).toBeGreaterThan(0);
        expect(s.financials.finalAuthMs).toBe(-1);
        expect(s.financials.identicalRerenders).toBeGreaterThan(0);
        expect(s.billing_preview).toBeUndefined();

        // OLD V2 still computes on the same sample, so one run yields both numbers.
        expect(v2().lastBlockingAuthoritativeMs).toBeGreaterThanOrEqual(0);
    });
});
