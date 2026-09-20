// @vitest-environment jsdom
/**
 * THE NAV MUST OBSERVE THE DOCUMENT'S COUNTS, NOT ASK FOR THEM AGAIN.
 *
 * The persistent left nav never owned a Work View totals request. It piggybacked on the Work Unit
 * surface's fetch through `dedupeAdminFetch`, and its own comment said so. The WU-03 document seed
 * retired that fetch, so the nav's call became the real one — measured deployed at ~1.5s of server
 * work per navigation, issued well after first-order finality.
 *
 * Two things make the repair correct, and BOTH are easy to get subtly wrong:
 *
 *   1. ORDERING. The totals hook decides ONCE whether a seed answers its question, on the first
 *      render where targets exist. A peeked answer arrives asynchronously. Publish targets before
 *      the seed and that single decision is spent on "no_seed" — the seed is then structurally
 *      unusable and the request goes out anyway. A deployed measurement already caught exactly
 *      this on the surface instance, and every unit gate passed at the time because each one
 *      supplied targets and seed together.
 *
 *   2. OBSERVATION, NOT OWNERSHIP. The answer lives behind a consume-once cache. A nav that
 *      consumed would steal it from the route's owner.
 *
 * These gates pin the ordering behaviourally against the REAL hook, and pin the wiring decisions
 * that no behavioural test can see from outside.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

const batchedSpy = vi.fn(async () => new Map<string, number>());
vi.mock("@/lib/presentation/runtime/fetchQueueViewTotalsBatched", () => ({
    fetchQueueViewTotalsBatched: (...args: unknown[]) => batchedSpy(...(args as [])),
}));

import { useWorkViewTotalsState } from "@/lib/presentation/runtime/useWorkViewTotals";
import type { WorkViewTotalsSeed } from "@/lib/runtime/provisioning/workViewTotalsSeedContract";
import {
    buildConfiguredViewSignature,
    emptyWorkViewTotalsSpans,
} from "@/lib/runtime/provisioning/workViewTotalsSeedContract";

const ORG = "org-1";
const HOST = "host-1";
const VIEW_A = "view-a";
const VIEW_B = "view-b";

const TARGETS = [
    { viewId: VIEW_A, workUnitId: HOST, baseQueueKey: "lane" },
    { viewId: VIEW_B, workUnitId: HOST, baseQueueKey: "lane" },
];
const NO_TARGETS: typeof TARGETS = [];

/*
 * NO CAST. The first version of this fixture invented `rows` with a `viewId` field and cast the
 * result through `unknown`, so it typechecked, compiled, and blew up at the first real matcher
 * call. A fixture that the contract does not check is not evidence about the contract.
 */
function seedFor(viewIds: string[], hostWorkUnitId = HOST): WorkViewTotalsSeed {
    return {
        status: "resolved",
        identity: {
            orgId: ORG,
            hostWorkUnitId,
            selectedSiteId: null,
            configuredViewSignature: buildConfiguredViewSignature(viewIds),
        },
        totals: viewIds.map((workViewId) => ({
            workUnitId: hostWorkUnitId,
            queueKey: "lane",
            workViewId,
            count: 7,
            known: true,
        })),
        spans: emptyWorkViewTotalsSpans(),
    };
}

/** The hook publishes its own fetch decision; that IS the acceptance signal the probe reads. */
function decisions(owner: string): string[] {
    const w = window as unknown as { __alloyWorkViewSeed?: { phase?: string; owner?: string; decision?: string }[] };
    return (w.__alloyWorkViewSeed ?? [])
        .filter((e) => e.phase === "fetch" && e.owner === owner)
        .map((e) => e.decision as string);
}

type Props = Parameters<typeof useWorkViewTotalsState>[0];

function Probe(props: Props) {
    useWorkViewTotalsState(props);
    return null;
}

function mount(props: Props) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(Probe, props)));
    return {
        rerender: (next: Props) => act(() => root.render(createElement(Probe, next))),
        unmount: () => act(() => root.unmount()),
    };
}

beforeEach(() => {
    batchedSpy.mockClear();
    (window as unknown as { __alloyWorkViewSeed?: unknown[] }).__alloyWorkViewSeed = [];
});
afterEach(() => {
    document.body.innerHTML = "";
});

describe("ordering: the seed must arrive before the question", () => {
    it("WITHHOLDING TARGETS UNTIL THE SEED ARRIVES SKIPS THE FETCH — this is the nav's repair", () => {
        // Render 1: the peek has not settled, so the nav publishes NO targets.
        const h = mount({
            ownerLabel: "nav-withholds",
            targets: NO_TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        expect(decisions("nav-withholds")).toEqual([]);

        // Render 2: the peek settled with a matching answer; targets and seed appear together.
        h.rerender({
            ownerLabel: "nav-withholds",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: seedFor([VIEW_A, VIEW_B]),
            seedOrgId: ORG,
            seedHostWorkUnitId: HOST,
        });

        expect(decisions("nav-withholds")).toEqual(["skipped_seeded"]);
        expect(batchedSpy).not.toHaveBeenCalled();
        h.unmount();
    });

    it("PUBLISHING TARGETS FIRST SPENDS THE ONE-SHOT AND FETCHES ANYWAY", () => {
        /*
         * The control for the gate above. Without it, "skipped_seeded" could be passing for a
         * reason that has nothing to do with ordering, and a regression that removed the gating
         * would stay green. The seed here is IDENTICAL and still arrives too late to be used.
         */
        const h = mount({
            ownerLabel: "nav-eager",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        h.rerender({
            ownerLabel: "nav-eager",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: seedFor([VIEW_A, VIEW_B]),
            seedOrgId: ORG,
            seedHostWorkUnitId: HOST,
        });

        expect(decisions("nav-eager")).toEqual(["fetching"]);
        h.unmount();
    });

    it("a settled MISS still fetches — the fallback is not removed", () => {
        const h = mount({
            ownerLabel: "nav-miss",
            targets: NO_TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        // Peek settled with nothing: targets appear, seed stays null.
        h.rerender({
            ownerLabel: "nav-miss",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        expect(decisions("nav-miss")).toEqual(["fetching"]);
        h.unmount();
    });

    it("A DIFFERENT CONFIGURED VIEW SET DOES NOT SUPPRESS THE FETCH", () => {
        /*
         * WHAT ACTUALLY PROTECTS THIS CONSUMER, stated precisely because the first version of
         * this gate got it wrong.
         *
         * The matcher compares the seed's identity against facts the client supplies. For the
         * Work Unit surface those facts are independent — it knows its own work unit id. For the
         * nav they are NOT: the seed and the identity both come out of the SAME peeked answer, so
         * the org and host checks compare that answer to itself and cannot fail. Sourcing the host
         * id from `answer.workUnit.id` rather than `seed.identity` does not change that.
         *
         * Two things are genuinely independent of the answer, and they are the nav's real guards:
         * the configured view signature (derived from the nav's own lifecycle cards) and the site
         * scope (from the nav's own workspace filter). Route binding is enforced earlier and
         * elsewhere — the peek is keyed by the CURRENT path's slug, so a previous work unit's
         * answer is not returned at all.
         */
        const h = mount({
            ownerLabel: "nav-config",
            targets: NO_TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        // Configuration moved on: the nav now shows a view the seed never counted.
        h.rerender({
            ownerLabel: "nav-config",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: seedFor([VIEW_A]),
            seedOrgId: ORG,
            seedHostWorkUnitId: HOST,
        });
        expect(decisions("nav-config")).toEqual(["fetching"]);
        h.unmount();
    });

    it("A SITE-FILTERED NAV DOES NOT CONSUME AN UNFILTERED SEED", () => {
        // The document composes with no site filter. Serving those counts to a filtered operator
        // would be a wrong number, not a stale one.
        const h = mount({
            ownerLabel: "nav-site",
            targets: NO_TARGETS,
            selectedSiteId: "site-1",
            enabled: true,
            documentSeed: null,
            seedOrgId: null,
            seedHostWorkUnitId: null,
        });
        h.rerender({
            ownerLabel: "nav-site",
            targets: TARGETS,
            selectedSiteId: "site-1",
            enabled: true,
            documentSeed: seedFor([VIEW_A, VIEW_B]),
            seedOrgId: ORG,
            seedHostWorkUnitId: HOST,
        });
        expect(decisions("nav-site")).toEqual(["fetching"]);
        h.unmount();
    });

    it("decides exactly once — repeated renders do not re-decide", () => {
        const props: Props = {
            ownerLabel: "nav-once",
            targets: TARGETS,
            selectedSiteId: null,
            enabled: true,
            documentSeed: seedFor([VIEW_A, VIEW_B]),
            seedOrgId: ORG,
            seedHostWorkUnitId: HOST,
        };
        const h = mount({ ...props, targets: NO_TARGETS, documentSeed: null, seedOrgId: null, seedHostWorkUnitId: null });
        h.rerender(props);
        h.rerender(props);
        h.rerender(props);
        expect(decisions("nav-once")).toEqual(["skipped_seeded"]);
        h.unmount();
    });
});

describe("the nav observes; it does not claim", () => {
    const SRC = (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readFileSync } = require("node:fs") as typeof import("node:fs");
        const { join } = require("node:path") as typeof import("node:path");
        const raw = readFileSync(join(process.cwd(), "app/adminV2/components/Sidebar.tsx"), "utf8");
        /*
         * Comments are stripped first. The prose in this file NAMES the things these gates forbid
         * — it explains why the nav must not consume — so an unstripped read fails on its own
         * explanation, and the obvious "fix" is to delete the explanation.
         */
        return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    })();

    it("PEEKS, NEVER CONSUMES", () => {
        // Consuming would delete the answer the Work Unit surface owns: a documented 4.7s defect.
        expect(SRC).toContain("peekFreshProvisioning");
        expect(SRC).not.toContain("consumeFreshProvisioning");
    });

    it("addresses the entry through the CANONICAL url builder", () => {
        // A hand-built string would drift from the seeding path and silently always miss.
        expect(SRC).toContain("provisioningAnswerUrl(workUnitSlug)");
    });

    it("RE-PEEKS ON EVERY ROUTE CHANGE AND CLEARS WHEN THERE IS NO ANSWER", () => {
        /*
         * This is the nav's actual route binding, and the only one it has. The nav is mounted
         * ABOVE the route and never remounts, so nothing else scopes its observation to the
         * current work unit: the peek key carries the CURRENT slug, the effect re-runs when that
         * slug changes, and a route with no fresh answer must fall back to a settled MISS rather
         * than keep serving the previous work unit's counts.
         */
        expect(SRC).toContain("provisioningAnswerUrl(workUnitSlug)");
        expect(SRC).toMatch(/\}, \[workUnitSlug\]\);/);
        expect(SRC).toMatch(/if\s*\(!promise\)\s*\{\s*setPeeked\(PEEK_MISS\);/);
        expect(SRC).toMatch(/if\s*\(!workUnitSlug\)\s*\{\s*setPeeked\(PEEK_MISS\);/);
    });

    it("withholds targets until the peek has settled", () => {
        expect(SRC).toMatch(/if\s*\(!peekSettled\)\s*return EMPTY_TARGETS;/);
    });

    it("names itself so a deployed probe can attribute the request", () => {
        // The owner of this request was unattributable for three deploys; "unlabelled" found it.
        expect(SRC).toContain('ownerLabel: "sidebar"');
    });
});
