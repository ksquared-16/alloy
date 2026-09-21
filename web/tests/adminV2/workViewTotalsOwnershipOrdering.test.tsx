// @vitest-environment jsdom
/**
 * THE GATE THE LAST IMPLEMENTATION DID NOT HAVE.
 *
 * The previous repair had the nav peek the provisioning cache. Twelve unit gates passed, a
 * production build passed, and it hit 0 of 6 times in production — because every fixture handed
 * the nav its seed and its targets in the same render, so not one of them could express WHO GOT
 * THERE FIRST. In production the route surface commits first, consumes the consume-once entry,
 * and the Suspense-deferred nav then finds nothing.
 *
 * So these gates run the REAL ownership relationship in PRODUCTION ORDER: the owner renders and
 * announces, the owner settles and publishes, and only then does the nav commit. The ordering is
 * the subject of the test, not an incidental detail of the fixture.
 *
 * The decisive one is "ordering reversed must FAIL" — without it, a fixture that silently went
 * back to simultaneous delivery would pass and re-certify the exact blind spot that shipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

const batchedSpy = vi.fn(async () => new Map<string, number>());
vi.mock("@/lib/presentation/runtime/fetchQueueViewTotalsBatched", () => ({
    fetchQueueViewTotalsBatched: (...a: unknown[]) => batchedSpy(...(a as [])),
}));

import {
    announceWorkViewTotalsOwner,
    buildPublishedWorkViewTotalsSeed,
    clearWorkViewTotalsPublication,
    getWorkViewTotalsPublication,
    getWorkViewTotalsPublicationServerSnapshot,
    publishWorkViewTotals,
    resetWorkViewTotalsPublicationForTests,
    subscribeWorkViewTotalsPublication,
} from "@/lib/presentation/runtime/workViewTotalsPublication";
import { useWorkViewTotalsState } from "@/lib/presentation/runtime/useWorkViewTotals";
import {
    buildConfiguredViewSignature,
    emptyWorkViewTotalsSpans,
    type WorkViewTotalsSeed,
} from "@/lib/runtime/provisioning/workViewTotalsSeedContract";
import { useSyncExternalStore, useMemo } from "react";

const ORG = "org-1";
const HOST = "host-1";
const VIEWS = ["view-a", "view-b"];
const TARGETS = VIEWS.map((viewId) => ({ viewId, workUnitId: HOST, baseQueueKey: "lane" }));

function seedFor(viewIds: string[], host = HOST, site: string | null = null): WorkViewTotalsSeed {
    return {
        status: "resolved",
        identity: {
            orgId: ORG,
            hostWorkUnitId: host,
            selectedSiteId: site,
            configuredViewSignature: buildConfiguredViewSignature(viewIds),
        },
        totals: viewIds.map((workViewId) => ({
            workUnitId: host,
            queueKey: "lane",
            workViewId,
            count: 4,
            known: true,
        })),
        spans: emptyWorkViewTotalsSpans(),
    };
}

/** The nav, modelled exactly as Sidebar.tsx wires it: observe, withhold targets while pending. */
function Nav({ site = null, views = VIEWS }: { site?: string | null; views?: string[] }) {
    const publication = useSyncExternalStore(
        subscribeWorkViewTotalsPublication,
        getWorkViewTotalsPublication,
        getWorkViewTotalsPublicationServerSnapshot,
    );
    const settled = publication.phase !== "pending";
    const published = publication.phase === "settled" ? publication : null;
    const targets = useMemo(
        () => (settled ? views.map((v) => ({ viewId: v, workUnitId: HOST, baseQueueKey: "lane" })) : []),
        [settled, views],
    );
    useWorkViewTotalsState({
        ownerLabel: "sidebar",
        targets,
        selectedSiteId: site,
        enabled: true,
        documentSeed: published?.seed ?? null,
        seedOrgId: published?.orgId ?? null,
        seedHostWorkUnitId: published?.hostWorkUnitId ?? null,
    });
    return null;
}

/** The owner, modelled as useWorkUnitSettlement wires it: announce in RENDER, publish later. */
function Owner({ publishNow, seed }: { publishNow: boolean; seed: WorkViewTotalsSeed | null }) {
    announceWorkViewTotalsOwner();
    if (publishNow) publishWorkViewTotals({ seed, orgId: ORG, hostWorkUnitId: HOST });
    return null;
}

function decisions(owner: string): string[] {
    const w = window as unknown as { __alloyWorkViewSeed?: { phase?: string; owner?: string; decision?: string }[] };
    return (w.__alloyWorkViewSeed ?? []).filter((e) => e.phase === "fetch" && e.owner === owner).map((e) => e.decision!);
}

function mount(ui: ReactNode) {
    const c = document.createElement("div");
    document.body.appendChild(c);
    const root = createRoot(c);
    act(() => root.render(ui));
    return { rerender: (n: ReactNode) => act(() => root.render(n)), unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
    batchedSpy.mockClear();
    resetWorkViewTotalsPublicationForTests();
    (window as unknown as { __alloyWorkViewSeed?: unknown[] }).__alloyWorkViewSeed = [];
});
afterEach(() => {
    document.body.innerHTML = "";
});

describe("production order: owner first, nav second", () => {
    it("THE NAV OBTAINS AUTHORITATIVE TOTALS WITHOUT FETCHING — the whole point", () => {
        // Owner renders and announces, then settles and publishes, THEN the nav commits.
        const h = mount(createElement(Owner, { publishNow: false, seed: null }));
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS), orgId: ORG, hostWorkUnitId: HOST }));
        h.rerender(
            createElement("div", null, createElement(Owner, { publishNow: false, seed: null }), createElement(Nav, {})),
        );
        expect(decisions("sidebar")).toEqual(["skipped_seeded"]);
        expect(batchedSpy).not.toHaveBeenCalled();
        h.unmount();
    });

    it("THE NAV WAITS WHILE AN OWNER IS PENDING, THEN USES THE ANSWER", () => {
        /*
         * The failure mode that shipped: commit the nav BEFORE the answer exists. Here the owner
         * has announced but not published, so the nav must withhold its question rather than spend
         * its single seed decision on "no_seed".
         */
        const h = mount(
            createElement("div", null, createElement(Owner, { publishNow: false, seed: null }), createElement(Nav, {})),
        );
        expect(decisions("sidebar")).toEqual([]); // withheld — not yet asked, and not fetching
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS), orgId: ORG, hostWorkUnitId: HOST }));
        expect(decisions("sidebar")).toEqual(["skipped_seeded"]);
        expect(batchedSpy).not.toHaveBeenCalled();
        h.unmount();
    });

    it("ORDERING REVERSED MUST FAIL — the control that keeps this suite honest", () => {
        /*
         * If the nav commits with NO owner announced, it is entitled to fall back immediately.
         * This is the shape the old fixtures accidentally tested. Asserting it FETCHES here is
         * what stops a future edit from quietly reverting to simultaneous delivery and passing.
         */
        const h = mount(createElement(Nav, {}));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });

    it("no owner on this route: the nav falls back immediately, never pending forever", () => {
        expect(getWorkViewTotalsPublication().phase).toBe("absent");
        const h = mount(createElement(Nav, {}));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });

    it("an owner that settles with NO authoritative totals still releases the nav", () => {
        // A null seed is "fall back", never "zero" — and must not strand the badges pending.
        const h = mount(createElement(Owner, { publishNow: false, seed: null }));
        act(() => publishWorkViewTotals({ seed: null, orgId: ORG, hostWorkUnitId: HOST }));
        h.rerender(createElement("div", null, createElement(Nav, {})));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });
});

describe("navigation matrix", () => {
    it("WORK UNIT A -> B: B's answer is used, A's is never shown for B", () => {
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS, "host-A"), orgId: ORG, hostWorkUnitId: "host-A" }));
        // Leaving A clears the claim; B announces and publishes its own.
        act(() => clearWorkViewTotalsPublication());
        expect(getWorkViewTotalsPublication().phase).toBe("absent");
        act(() => {
            announceWorkViewTotalsOwner();
            publishWorkViewTotals({ seed: seedFor(VIEWS, HOST), orgId: ORG, hostWorkUnitId: HOST });
        });
        const h = mount(createElement(Nav, {}));
        expect(decisions("sidebar")).toEqual(["skipped_seeded"]);
        h.unmount();
    });

    it("WORK UNIT -> NON-WORK-UNIT: the previous totals do not survive", () => {
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS), orgId: ORG, hostWorkUnitId: HOST }));
        act(() => clearWorkViewTotalsPublication());
        // No owner on the new route: absent, so the nav falls back rather than reusing stale counts.
        expect(getWorkViewTotalsPublication().phase).toBe("absent");
        const h = mount(createElement(Nav, {}));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });

    it("SITE A -> SITE B: an unfiltered answer is refused by a filtered nav", () => {
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS, HOST, null), orgId: ORG, hostWorkUnitId: HOST }));
        const h = mount(createElement(Nav, { site: "site-B" }));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });

    it("CONFIGURATION N -> N+1: an answer for the old view set is refused", () => {
        act(() => publishWorkViewTotals({ seed: seedFor(["view-a"]), orgId: ORG, hostWorkUnitId: HOST }));
        const h = mount(createElement(Nav, { views: ["view-a", "view-b"] }));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });
});

describe("the publication is a carrier, not a second evaluator", () => {
    it("IS PUBLISH-ONLY — it can never acquire totals itself", async () => {
        // A publication that could fetch would be a second owner of the same question.
        const mod = await import("@/lib/presentation/runtime/workViewTotalsPublication");
        expect(Object.keys(mod)).not.toContain("warm");
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const src = readFileSync(join(process.cwd(), "lib/presentation/runtime/workViewTotalsPublication.ts"), "utf8");
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).toMatch(/publish-only/);
    });

    it("carries UNKNOWN as unknown, never as zero", () => {
        const seed: WorkViewTotalsSeed = {
            status: "resolved",
            identity: {
                orgId: ORG,
                hostWorkUnitId: HOST,
                selectedSiteId: null,
                configuredViewSignature: buildConfiguredViewSignature(VIEWS),
            },
            totals: [
                { workUnitId: HOST, queueKey: "lane", workViewId: "view-a", count: null, known: false },
                { workUnitId: HOST, queueKey: "lane", workViewId: "view-b", count: 0, known: true },
            ],
            spans: emptyWorkViewTotalsSpans(),
        };
        act(() => publishWorkViewTotals({ seed, orgId: ORG, hostWorkUnitId: HOST }));
        const got = getWorkViewTotalsPublication();
        expect(got.phase).toBe("settled");
        const rows = got.phase === "settled" ? got.seed!.status === "resolved" && got.seed!.totals : [];
        expect(rows).toEqual([
            { workUnitId: HOST, queueKey: "lane", workViewId: "view-a", count: null, known: false },
            // A known zero stays a zero; an unknown stays null. They are different answers.
            { workUnitId: HOST, queueKey: "lane", workViewId: "view-b", count: 0, known: true },
        ]);
    });

    it("carries no authorization verdict", () => {
        /*
         * Comments are stripped first. This module's prose NAMES what it must not carry — it
         * explains that no authorization verdict travels with the counts — so an unstripped read
         * fails on its own explanation and the tempting "fix" is to delete the explanation.
         */
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "lib/presentation/runtime/workViewTotalsPublication.ts"), "utf8");
        const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        for (const forbidden of ["accessible", "departmentMetadata", "canMutate", "authoriz"]) {
            expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
    });

    it("re-announcing does not discard a terminal answer", () => {
        act(() => publishWorkViewTotals({ seed: seedFor(VIEWS), orgId: ORG, hostWorkUnitId: HOST }));
        act(() => announceWorkViewTotalsOwner()); // a re-render of the owner
        expect(getWorkViewTotalsPublication().phase).toBe("settled");
    });
});

describe("the REAL owner is wired, not just the fixture", () => {
    /*
     * WHY THESE EXIST. The ordering gates above model the owner with a fixture component. That is
     * right for testing ORDER, but it means a defect planted in the real `useWorkUnitSettlement`
     * changes nothing those gates run — four planted defects (never publish, never announce,
     * never clear, UNKNOWN becomes zero) all stayed green against the fixture. A stand-in for the
     * owner cannot catch the owner breaking, so the real wiring is pinned here directly.
     */
    const OWNER = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "lib/presentation/runtime/useWorkUnitSettlement.ts"), "utf8");
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    })();

    it("ANNOUNCES IN RENDER PHASE — not in an effect", () => {
        /*
         * The announcement must precede the nav's effects. Moving it into an effect would put it
         * back in the same ordering race that made the peek fail, and every gate above would
         * still pass because the fixture announces during render.
         */
        expect(OWNER).toContain("announceWorkViewTotalsOwner();");
        expect(OWNER).not.toMatch(/useEffect\([^)]*announceWorkViewTotalsOwner/);
    });

    it("PUBLISHES its resolved totals", () => {
        expect(OWNER).toContain("publishWorkViewTotals(");
        expect(OWNER).toContain("buildPublishedWorkViewTotalsSeed(");
        // From the RESOLVED totals, so the evaluator's own fetch is the single canonical fallback.
        expect(OWNER).toContain("totals: totalsState.totals");
    });

    it("PUBLISHES NULL ONLY WHEN IT GENUINELY HAS NOTHING — otherwise two owners fetch", () => {
        /*
         * If the owner published null while still having fetched its own totals, BOTH it and the
         * nav would issue a request: two logical fallback owners for one question. Request dedupe
         * would hide that in production, which is exactly why it is pinned at the source instead.
         * The null branch must stay guarded by a real "nothing to share" condition.
         */
        expect(OWNER).toContain("if (targets.length === 0 || !settlementOrgId || !workUnitId) {");
        expect(OWNER).not.toMatch(/if\s*\(true\)\s*\{[\s\S]{0,200}?publishWorkViewTotals/);
    });

    it("CLEARS the claim when it leaves the route", () => {
        // Without this the next route's nav could observe the previous work unit's counts.
        expect(OWNER).toContain("useEffect(() => clearWorkViewTotalsPublication, []);");
    });
});

describe("the published answer is built correctly", () => {
    const keyOf = (w: string, v: string) => `${w}|${v}`;

    it("PRESERVES UNKNOWN — a missing count is null/known:false, never zero", () => {
        const seed = buildPublishedWorkViewTotalsSeed({
            targets: [
                { viewId: "view-a", workUnitId: HOST, baseQueueKey: "lane" },
                { viewId: "view-b", workUnitId: HOST, baseQueueKey: "lane" },
            ],
            // view-b is absent from the map entirely: the owner does not know its count.
            totals: new Map<string, number | null>([[keyOf(HOST, "view-a"), 0]]),
            keyOf,
            orgId: ORG,
            hostWorkUnitId: HOST,
            selectedSiteId: null,
        });
        const rows = seed.status === "resolved" ? seed.totals : [];
        // A known zero stays zero; an unknown stays unknown. Collapsing them is the classic defect.
        expect(rows).toEqual([
            { workUnitId: HOST, queueKey: "lane", workViewId: "view-a", count: 0, known: true },
            { workUnitId: HOST, queueKey: "lane", workViewId: "view-b", count: null, known: false },
        ]);
    });

    it("an explicit null count is UNKNOWN, not zero", () => {
        const seed = buildPublishedWorkViewTotalsSeed({
            targets: [{ viewId: "view-a", workUnitId: HOST, baseQueueKey: "lane" }],
            totals: new Map<string, number | null>([[keyOf(HOST, "view-a"), null]]),
            keyOf,
            orgId: ORG,
            hostWorkUnitId: HOST,
            selectedSiteId: null,
        });
        const rows = seed.status === "resolved" ? seed.totals : [];
        expect(rows[0]).toEqual({
            workUnitId: HOST,
            queueKey: "lane",
            workViewId: "view-a",
            count: null,
            known: false,
        });
    });

    it("states the scope it was resolved for", () => {
        const seed = buildPublishedWorkViewTotalsSeed({
            targets: [{ viewId: "view-a", workUnitId: HOST, baseQueueKey: "lane" }],
            totals: new Map(),
            keyOf,
            orgId: ORG,
            hostWorkUnitId: HOST,
            selectedSiteId: "site-9",
        });
        expect(seed.status === "resolved" && seed.identity).toEqual({
            orgId: ORG,
            hostWorkUnitId: HOST,
            selectedSiteId: "site-9",
            configuredViewSignature: "view-a",
        });
    });
});

describe("configuration identity binds content, not size", () => {
    it("A DIFFERENT VIEW OF THE SAME SIGNATURE LENGTH IS STILL REFUSED", () => {
        /*
         * "view-a" and "view-b" produce signatures of IDENTICAL length. A matcher that compared
         * cardinality or string length instead of identity would accept one configuration's counts
         * for another whenever the sizes happened to line up — and a fixture whose two cases
         * differ in length would never notice.
         */
        act(() => publishWorkViewTotals({ seed: seedFor(["view-a"]), orgId: ORG, hostWorkUnitId: HOST }));
        const h = mount(createElement(Nav, { views: ["view-b"] }));
        expect(decisions("sidebar")).toEqual(["fetching"]);
        h.unmount();
    });
});
