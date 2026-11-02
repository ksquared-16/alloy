// @vitest-environment jsdom
/**
 * WHY THE HISTORICAL-DRAFT UI PROOF FOUND NO FINANCIALS CARD — reproduced on the production surface.
 *
 * The governed run of f13d7915 (qar_1d07b1e6ddba F6.4) rendered the adapter's route at its own path, signed in as
 * persona=admin, 125 requests / 0 writes / 0 foreign — and captured financials_cards=0, details_actions=0,
 * ledger_rows=0. These tests hold the mechanism with the real router target (`DurableRecordSurface`, as the record
 * page mounts it), the real composers and the real adapter selectors:
 *
 *   · a CHILD durable record composes exactly the Children card (`deriveChildFocusPanelCards`), whatever the child's
 *     truth — Financials is never a card of that grid; the page passes no `leadCard`, so the Financials LEAD (the
 *     only place a durable record mounts FinancialsCard) is never rendered either; `?card=financials` is an aspect
 *     focus for a card that does not exist there, and changes nothing;
 *   · the record itself DID render (`data-durable-record="ready"`, the Children card present): zero is "the proof
 *     component is not on this surface", not a login, 404, error or loading page;
 *   · negative control: the same surface, given the household and `leadCard="financials"` (the Billing path), does
 *     mount the Financials card — the detector sees it when it is there.
 *
 * THE REPAIR held here: `?card=financials` on a HOUSEHOLD record addresses that Financials lead
 * (`durableRecordLeadCardFor`, threaded by the record page), and the adapter's route is the fixture household's
 * record. Rendered through the production surface and driven by the production driver, the draft row then appears
 * once, at the template price, still a draft — and the pre-repair child route still shows nothing.
 */
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {}, back: () => {} }),
    usePathname: () => "/workspace/record/child/x",
    useSearchParams: () => new URLSearchParams("card=financials"),
}));

import DurableRecordSurface from "@/components/presentation/durableRecord/DurableRecordSurface";
import { deriveChildFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveChildFocusPanelCards";
import { deriveHouseholdFocusPanelCards } from "@/lib/adminV2/runtime/focusPanel/durableSubject/deriveHouseholdFocusPanelCards";
import { encodeDurableRecordModel } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import {
    focusPanelWorkModeModelFromDurableChild,
    focusPanelWorkModeModelFromDurableHousehold,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/focusPanelWorkModeModelFromDurableSubject";
import { durableRecordHref, durableRecordLeadCardFor } from "@/lib/runtime/focus/durableRecordRoute";

import { CATALOG_AMOUNT_CENTS, IDS, TEMPLATE_AMOUNT_CENTS } from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import { createPlaywrightWorkflowDriver } from "../../scripts/qa/qaWorkflowVerifierPlaywright.mjs";
import { FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER as A, HISTORICAL_DRAFT_UI_ROUTE } from "../../scripts/qa/financialsHistoricalDraftUi";

const WEB = path.resolve(__dirname, "../..");
const PRE_REPAIR_ROUTE = durableRecordHref("child", IDS.member, "financials");
const NOW = new Date("2026-09-15T12:00:00.000Z");

/** The fixture's child, as the durable composer would hand it on (ids from the fixture core; no customer data). */
const CHILD = {
    memberId: IDS.member, personId: IDS.person, householdId: IDS.customer, label: "Fixture Child",
    dateOfBirth: null, householdName: "Financials Cert Historical Draft", isActive: true,
    truth: { "member.id": IDS.member, "customer.id": IDS.customer, "household.id": IDS.customer, "person.id": IDS.person },
} as never;
const HOUSEHOLD = {
    householdId: IDS.customer, label: "Financials Cert Historical Draft", contacts: [], children: [],
    truth: { "customer.id": IDS.customer, "household.id": IDS.customer },
} as never;

const capture = (name: string) => {
    const spec = A.capture.find((c) => c.name === name)!;
    return document.querySelectorAll(spec.selector).length;
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let seen: string[];

function stubRecord(body: Record<string, unknown>) {
    seen = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
        const url = String(input);
        seen.push(url.split("?")[0]);
        const json = url.startsWith("/api/admin/durable-record?") ? { ok: true, contexts: [], relatedWork: [], ...body } : {};
        return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }));
}
async function settle() {
    for (let i = 0; i < 5; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe("the historical-draft UI route hosts no Financials card", () => {
    it("the pre-repair route (f13d7915) was the CHILD durable record; the child address still yields no lead", () => {
        expect(PRE_REPAIR_ROUTE).toBe(`/workspace/record/child/${IDS.member}?card=financials`);
        expect(durableRecordLeadCardFor("child", "financials")).toBeNull();
        // The page threads the lead only through `durableRecordLeadCardFor`; no focus source from an address.
        const page = readFileSync(path.join(WEB, "app/adminV2/workspace/record/[subjectType]/[subjectId]/page.tsx"), "utf8");
        const jsx = page.slice(page.indexOf("<DurableRecordSurface"), page.indexOf("/>", page.indexOf("<DurableRecordSurface")));
        expect(jsx).toMatch(/subjectType=/); expect(jsx).toMatch(/cardKey=\{cardKey\}/);
        expect(jsx).toMatch(/leadCard=\{durableRecordLeadCardFor\(subjectType, cardKey\)\}/);
        expect(jsx).not.toMatch(/focusSource/);
    });

    it("the child and household durable composers never compose a Financials card, whatever the subject's truth", () => {
        const truths = [{}, { "customer.id": IDS.customer }, { "customer.id": IDS.customer, "financials.balance_cents": 7500 }];
        for (const truth of truths) {
            const child = deriveChildFocusPanelCards({ subject: { ...(CHILD as object), truth } as never, now: NOW });
            expect([...child.keys()]).not.toContain("financials");
            expect([...child.keys()]).toEqual(["children"]);
            const hh = deriveHouseholdFocusPanelCards({ subject: { ...(HOUSEHOLD as object), truth } as never });
            expect([...hh.keys()]).not.toContain("financials");
        }
    });

    it("rendered on the production surface: the record is READY with its Children card, and zero Financials markup", async () => {
        const model = focusPanelWorkModeModelFromDurableChild({ mode: "summary", subject: CHILD, canMutate: false, now: NOW } as never);
        stubRecord({ model: encodeDurableRecordModel(model), childSubject: CHILD, householdSubject: null });
        await act(async () => {
            root.render(<DurableRecordSurface subjectType="child" subjectId={IDS.member} cardKey="financials" leadCard={durableRecordLeadCardFor("child", "financials")} />);
        });
        await settle();
        expect(seen).toContain("/api/admin/durable-record");
        expect(container.querySelector('[data-durable-record="ready"]')).not.toBeNull();
        expect(container.querySelector('[data-durable-record="not-found"], [data-durable-record="error"], [data-durable-record="loading"]')).toBeNull();
        expect(container.querySelector('[data-universal-card-key="children"]')).not.toBeNull();
        // Exactly what the governed run captured.
        for (const name of ["financials_cards", "details_actions", "details_surfaces", "period_toggles", "ledger_rows", "financials_unavailable"]) {
            expect(capture(name), name).toBe(0);
        }
        expect(container.querySelector('[data-durable-record-lead="financials"]')).toBeNull();
    });

    it("negative control: the same surface with the household and leadCard=financials (the Billing path) mounts the Financials card", async () => {
        const model = focusPanelWorkModeModelFromDurableHousehold({ mode: "summary", subject: HOUSEHOLD, canMutate: false, now: NOW } as never);
        stubRecord({ model: encodeDurableRecordModel(model), householdSubject: HOUSEHOLD, financialFocus: null });
        await act(async () => {
            root.render(<DurableRecordSurface subjectType="household" subjectId={IDS.customer} leadCard="financials" />);
        });
        await settle();
        expect(container.querySelector('[data-durable-record="ready"]')).not.toBeNull();
        expect(container.querySelector('[data-durable-record-lead="financials"]')).not.toBeNull();
        expect(capture("financials_cards")).toBeGreaterThan(0);
    });

    it("negative control: the same household record WITHOUT leadCard (what a URL can express today) has no Financials card", async () => {
        const model = focusPanelWorkModeModelFromDurableHousehold({ mode: "summary", subject: HOUSEHOLD, canMutate: false, now: NOW } as never);
        stubRecord({ model: encodeDurableRecordModel(model), householdSubject: HOUSEHOLD, financialFocus: null });
        await act(async () => {
            root.render(<DurableRecordSurface subjectType="household" subjectId={IDS.customer} cardKey="financials" />);
        });
        await settle();
        expect(container.querySelector('[data-durable-record="ready"]')).not.toBeNull();
        expect(capture("financials_cards")).toBe(0);
    });

    it("the address helper: only household + financials asks for the Financials lead", () => {
        expect(durableRecordLeadCardFor("household", "financials")).toBe("financials");
        expect(durableRecordLeadCardFor(" Household ", " financials ")).toBe("financials");
        for (const [t, c] of [["household", null], ["household", "household"], ["household", "documents"], ["child", "financials"], ["person", "financials"], ["household", "Financials"]] as const) {
            expect(durableRecordLeadCardFor(t, c), `${t}/${c}`).toBeNull();
        }
    });

    it("the adapter's route is now the fixture HOUSEHOLD's record with card=financials", () => {
        expect(HISTORICAL_DRAFT_UI_ROUTE).toBe(durableRecordHref("household", IDS.customer, "financials"));
        expect(HISTORICAL_DRAFT_UI_ROUTE).toBe(`/workspace/record/household/${IDS.customer}?card=financials`);
        expect(A.routes).toEqual([{ id: "child_financials", path: HISTORICAL_DRAFT_UI_ROUTE }]);
    });
});

/* ── THE REPAIRED ROUTE, END TO END: production surface + production driver + adapter, deterministic account ── */
const DRAFT = "7a1b2c3d-0000-4000-8000-00000000d001";
const POSTED = "7a1b2c3d-0000-4000-8000-00000000d0ff";
const ORIGIN = "http://127.0.0.1:4411";
const SEPT = { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" };
const MARCH = { key: "2026-03", start: "2026-03-01", end: "2026-03-31", label: "March 2026" };
const row = (chargeId: string, date: string, amountCents: number, lifecycle: "draft" | "posted") => ({
    chargeId, date, periodKey: date.slice(0, 7), periodBasis: "bound", subjectMemberId: IDS.member, subjectName: "Fixture Child",
    categoryKey: "registration", categoryLabel: "Registration", description: "Registration", amountCents, currencyCode: "USD",
    status: lifecycle, lifecycleStatus: lifecycle, awaiting: null, correctsChargeId: null, correctionKind: null, reversedByChargeId: null,
    offersReverse: false, appliedCents: 0, outstandingCents: lifecycle === "posted" ? amountCents : 0, offersPayment: false, dueDate: null,
    glCode: null, glAccountName: null, responsiblePartyName: null, responsibilityUnassigned: false, source: null, reduction: null,
});
/** The empty account of `financialsRootStaleGuarantee.test.tsx`, for the fixture household, plus the given rows. */
function vmWith(rows: ReturnType<typeof row>[]) {
    const groups = [SEPT, MARCH].map((period) => ({ period, rows: rows.filter((r) => r.periodKey === period.key) }))
        .filter((g) => g.rows.length).map((g) => ({ ...g, totalCents: g.rows.reduce((t, r) => t + r.amountCents, 0) }));
    const zero = { grossCents: 0, discountsCents: 0, fundingCents: 0, adjustmentsCents: 0, responsibilityCents: 0, paymentsCents: 0, balanceCents: 0, scheduledCents: 0, draftCents: 0 };
    return {
        account: { customerId: IDS.customer, label: "Financials Cert Historical Draft" }, period: SEPT, payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false }, expectedFunding: [],
        collectible: { outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0, actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0 },
        subjects: [], reductions: [], rows, reconciliation: zero, reconciliationBySubject: {}, pastDue: null, pastDueBySubject: {},
        ledgerPeriods: groups, payments: [], chargeTemplates: [], unavailable: [], paymentSetup: null, paymentCapabilities: null,
        payerCandidates: [], achAvailable: false, openCollections: [], unavailableReason: null,
    };
}

/** Navigate the production driver to `route`: the page's own derivation of the surface props from the address. */
async function driveRoute(route: string, accountRows: ReturnType<typeof row>[]) {
    const net = new EventEmitter();
    const recordModel = focusPanelWorkModeModelFromDurableHousehold({ mode: "summary", subject: HOUSEHOLD, canMutate: false, now: NOW } as never);
    const childModel = focusPanelWorkModeModelFromDurableChild({ mode: "summary", subject: CHILD, canMutate: false, now: NOW } as never);
    let seq = 0;
    vi.stubGlobal("fetch", vi.fn((input: unknown) => {
        const url = String(input);
        const req = { id: (seq += 1), url };
        net.emit("request", req);
        const body = url.startsWith("/api/admin/durable-record?subject_type=household")
            ? { ok: true, contexts: [], relatedWork: [], model: encodeDurableRecordModel(recordModel), householdSubject: HOUSEHOLD, financialFocus: null }
            : url.startsWith("/api/admin/durable-record?subject_type=child")
                ? { ok: true, contexts: [], relatedWork: [], model: encodeDurableRecordModel(childModel), childSubject: CHILD, householdSubject: null }
                : url.startsWith("/api/admin/financials/card?") ? { ok: true, vm: vmWith(accountRows) } : {};
        return new Promise((resolve) => setTimeout(() => {
            net.emit("requestfinished", req);
            resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
        }, 15));
    }));
    const u = new URL(route, ORIGIN);
    const [, , , subjectType, subjectId] = u.pathname.split("/");
    const cardKey = u.searchParams.get("card");
    const mount = async () => {
        await act(async () => {
            root.render(<DurableRecordSurface subjectType={subjectType as never} subjectId={decodeURIComponent(subjectId)} cardKey={cardKey} leadCard={durableRecordLeadCardFor(subjectType, cardKey)} />);
        });
    };
    /* Playwright's goto(waitUntil: "networkidle"): navigation returns once nothing has been in flight for 500 ms. */
    let inflight = 0;
    let changedAt = Date.now();
    net.on("request", () => { inflight += 1; changedAt = Date.now(); });
    net.on("requestfinished", () => { inflight -= 1; changedAt = Date.now(); });
    const networkIdle = async () => {
        const start = Date.now();
        while (!(inflight === 0 && Date.now() - Math.max(changedAt, start) >= 500)) {
            if (Date.now() - start > 5_000) throw new Error("navigation never went network-idle");
            await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
        }
    };
    const page = {
        on: (e: string, fn: (...a: unknown[]) => void) => net.on(e, fn),
        goto: async () => { await mount(); await networkIdle(); }, waitForLoadState: async () => {},
        $$: async (selector: string) => Array.from(document.querySelectorAll(selector)).map((el) => ({ click: async () => { await act(async () => { (el as HTMLElement).click(); }); } })),
        $$eval: async (selector: string, fn: (els: Element[], s: unknown) => unknown, spec: unknown) => fn(Array.from(document.querySelectorAll(selector)), spec),
        url: () => u.href, content: async () => "", close: async () => {},
    };
    const loadPlaywright = async () => ({ chromium: { launch: async () => ({ newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }), close: async () => {} }) } });
    const policy = { baseOrigin: ORIGIN, storageStatePath: "/nonexistent", reveal: A.reveal, capture: A.capture, judge: () => ({ ok: true }) };
    const session = await createPlaywrightWorkflowDriver({ loadPlaywright, timeoutMs: 3_000, quietMs: 60 }).open(policy);
    try {
        return (await session.visit(route)).snapshot as Record<string, Array<{ attrs: Record<string, string | null>; parts: Record<string, string | null> }>>;
    } finally {
        await session.close();
    }
}
const failed = (snap: unknown, draftChargeId = DRAFT) => A.assert("child_financials", snap as never, { draftChargeId }).filter((c) => !c.ok).map((c) => c.check);
const DRAFT_ROW = row(DRAFT, "2026-03-16", TEMPLATE_AMOUNT_CENTS, "draft");
const POSTED_ROW = row(POSTED, "2026-09-02", 12_000, "posted");

describe("the repaired route, end to end on the production surface", () => {
    it("the household record opens on the Financials lead; Details, then the collapsed March period, shows the draft once at 75.00, still a draft", async () => {
        const snap = await driveRoute(HISTORICAL_DRAFT_UI_ROUTE, [DRAFT_ROW, POSTED_ROW]);
        expect(snap.financials_cards.length).toBeGreaterThan(0);
        expect(snap.details_surfaces).toHaveLength(1);
        const draft = snap.ledger_rows.find((r) => r.attrs["data-financials-ledger-row"] === DRAFT)!;
        expect(draft.parts.amount).toContain("75.00");
        expect(draft.parts.state).toBe("scheduled");
        expect(failed(snap)).toEqual([]);
    });

    it("negative control: the pre-repair child route, same account, same driver, still captures nothing", async () => {
        const snap = await driveRoute(PRE_REPAIR_ROUTE, [DRAFT_ROW, POSTED_ROW]);
        expect(snap.financials_cards).toEqual([]);
        expect(snap.ledger_rows).toEqual([]);
        expect(failed(snap)).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
    });

    it("the assertions still bite on the repaired route: hazard price, posted draft, absent draft, wrong identity", async () => {
        const hazard = failed(await driveRoute(HISTORICAL_DRAFT_UI_ROUTE, [row(DRAFT, "2026-03-16", CATALOG_AMOUNT_CENTS, "draft"), POSTED_ROW]));
        expect(hazard.some((c) => c.includes("template price"))).toBe(true);
        expect(hazard.some((c) => c.includes("is not a charge on the child (rows=1)"))).toBe(true);
        root.unmount(); root = createRoot(container);
        expect(failed(await driveRoute(HISTORICAL_DRAFT_UI_ROUTE, [row(DRAFT, "2026-03-16", TEMPLATE_AMOUNT_CENTS, "posted"), POSTED_ROW])).some((c) => c.includes("state=not-a-draft"))).toBe(true);
        root.unmount(); root = createRoot(container);
        const absent = await driveRoute(HISTORICAL_DRAFT_UI_ROUTE, [POSTED_ROW]);
        expect(failed(absent)).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
        expect(failed(absent, "7a1b2c3d-0000-4000-8000-00000000beef")[0]).toContain("found 0");
    });
});
