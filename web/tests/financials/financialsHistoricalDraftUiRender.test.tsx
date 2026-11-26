// @vitest-environment jsdom
/**
 * THE FINANCIALS UI CAPTURE, END TO END WITHOUT A BROWSER: the real focus-panel `FinancialsCard` (as the durable
 * record's grid mounts it), driven by the real Playwright driver code over a jsdom page, judged by the real adapter.
 *
 * Why this exists: the governed QA run captured `ledger_rows=0` on the fixture child's record. The record route
 * mounts Financials in its compact placement, and the ledger rows are rendered only by the Details surface; the
 * adapter never opened Details, so nothing it could capture existed. These tests hold that path with deterministic
 * account data — the draft present, absent, at the wrong price, under the wrong identity, still loading, or failed.
 *
 * Only the panel coordination hook is replaced (there is no panel here). The account read is a stubbed `fetch`
 * that also reports request start/finish to the driver, the way Playwright's page events would.
 */
import { EventEmitter } from "node:events";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));

import FinancialsCard from "@/components/admin/focusPanel/cards/FinancialsCard";
import { CATALOG_AMOUNT_CENTS, IDS, TEMPLATE_AMOUNT_CENTS } from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import { FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER as A } from "../../scripts/qa/financialsHistoricalDraftUi";
import { createPlaywrightWorkflowDriver } from "../../scripts/qa/qaWorkflowVerifierPlaywright.mjs";

const HOUSEHOLD = "aaaaaaaa-0000-4000-8000-00000000000a";
const DRAFT = "7a1b2c3d-0000-4000-8000-00000000d001";
const POSTED = "7a1b2c3d-0000-4000-8000-00000000d0ff";
const ORIGIN = "http://127.0.0.1:4411";
const PRE_FIX_REVEAL = ['[data-financials-period-toggle][aria-expanded="false"]'];

const ledgerRow = (chargeId: string, date: string, amountCents: number, lifecycle: "draft" | "posted") => ({
    chargeId,
    date,
    periodKey: date.slice(0, 7),
    periodBasis: "bound",
    subjectMemberId: IDS.member,
    subjectName: "Fixture Child",
    categoryKey: "registration",
    categoryLabel: "Registration",
    description: "Registration",
    amountCents,
    currencyCode: "USD",
    status: lifecycle,
    lifecycleStatus: lifecycle,
    awaiting: null,
    correctsChargeId: null,
    correctionKind: null,
    reversedByChargeId: null,
    offersReverse: false,
    appliedCents: 0,
    outstandingCents: lifecycle === "posted" ? amountCents : 0,
    offersPayment: false,
    dueDate: null,
    glCode: null,
    glAccountName: null,
    responsiblePartyName: null,
    responsibilityUnassigned: false,
    source: null,
    reduction: null,
});

const SEPT = { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" };
const MARCH = { key: "2026-03", start: "2026-03-01", end: "2026-03-31", label: "March 2026" };

/** The empty account transcribed in `financialsRootStaleGuarantee.test.tsx`, plus the rows a case asks for. */
function vmWith(rows: ReturnType<typeof ledgerRow>[]) {
    const groups = [SEPT, MARCH]
        .map((period) => ({ period, rows: rows.filter((r) => r.periodKey === period.key) }))
        .filter((g) => g.rows.length)
        .map((g) => ({ ...g, totalCents: g.rows.reduce((s, r) => s + r.amountCents, 0) }));
    const zero = { grossCents: 0, discountsCents: 0, fundingCents: 0, adjustmentsCents: 0, responsibilityCents: 0, paymentsCents: 0, balanceCents: 0, scheduledCents: 0, draftCents: 0 };
    return {
        account: { customerId: HOUSEHOLD, label: "Household aaaa" },
        period: SEPT,
        payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        expectedFunding: [],
        collectible: { outstandingCents: 0, expectedSubsidyCents: 0, submittedClaimSuppressionCents: 0, actualSubsidyReceivedCents: 0, unresolvedVarianceCents: 0, currentlyCollectibleCents: 0 },
        subjects: [],
        reductions: [],
        rows,
        reconciliation: zero,
        reconciliationBySubject: {},
        pastDue: null,
        pastDueBySubject: {},
        ledgerPeriods: groups,
        payments: [],
        chargeTemplates: [],
        unavailable: [],
        paymentSetup: null,
        paymentCapabilities: null,
        payerCandidates: [],
        achAvailable: false,
        openCollections: [],
        unavailableReason: null,
    };
}

const contextFor = (vm: unknown) =>
    ({
        truth: { "customer.id": HOUSEHOLD },
        participantScope: null,
        status: "settled",
        operationalProjection: { cards: { financials: { state: "ready", data: vm } } },
    }) as never;

const DRAFT_ROW = ledgerRow(DRAFT, "2026-03-16", TEMPLATE_AMOUNT_CENTS, "draft");
const POSTED_ROW = ledgerRow(POSTED, "2026-09-02", 12_000, "posted");

type Read = "lands" | "never" | "fails";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let net: EventEmitter;

/** `fetch` for the card: the account read answers with `deepVm`; every other read answers empty. */
function stubFetch(deepVm: unknown, read: Read) {
    let seq = 0;
    vi.stubGlobal(
        "fetch",
        vi.fn((input: unknown) => {
            const url = String(input);
            const req = { id: (seq += 1), url };
            net.emit("request", req);
            const done = (ok: boolean) => net.emit(ok ? "requestfinished" : "requestfailed", req);
            const isAccount = url.startsWith("/api/admin/financials/card?");
            if (isAccount && read === "never") return new Promise(() => {});
            if (isAccount && read === "fails") {
                return new Promise((_, reject) => setTimeout(() => (done(false), reject(new TypeError("Failed to fetch"))), 20));
            }
            const body = isAccount ? { ok: true, vm: deepVm } : {};
            return new Promise((resolve) =>
                setTimeout(() => {
                    done(true);
                    resolve({ ok: true, status: 200, json: async () => body });
                }, 20),
            );
        }),
    );
}

/** The production driver over this document: Playwright's page surface, backed by jsdom and the fetch stub. */
function jsdomPlaywright(mount: () => Promise<void>) {
    const page = {
        on: (e: string, fn: (...a: unknown[]) => void) => net.on(e, fn),
        // Navigation IS the mount: the driver's request accounting is attached before it, as in Playwright.
        goto: mount,
        waitForLoadState: async () => {},
        $$: async (selector: string) =>
            Array.from(document.querySelectorAll(selector)).map((el) => ({
                click: async () => {
                    await act(async () => {
                        (el as HTMLElement).click();
                    });
                },
            })),
        $$eval: async (selector: string, fn: (els: Element[], s: unknown) => unknown, spec: unknown) => fn(Array.from(document.querySelectorAll(selector)), spec),
        url: () => `${ORIGIN}${A.routes[0].path}`,
        content: async () => "",
        close: async () => {},
    };
    return async () => ({
        chromium: {
            launch: async () => ({
                newContext: async () => ({ route: async () => {}, newPage: async () => page, close: async () => {} }),
                close: async () => {},
            }),
        },
    });
}

async function visit({ density = "compact", deepRows = [DRAFT_ROW, POSTED_ROW], read = "lands" as Read, reveal = A.reveal as readonly string[], timeoutMs = 2_000 } = {}) {
    stubFetch(vmWith(deepRows), read);
    const model = { key: "financials", title: "Financials", iconName: "DollarSign", tier: "work", archetype: "ledger", span: "row", density } as never;
    const mount = async () => {
        await act(async () => {
            // The projection the grid hands the card is the SUMMARY account: the same account, without its old periods.
            root.render(<FinancialsCard model={model} context={contextFor(vmWith([POSTED_ROW]))} />);
        });
    };
    const policy = { baseOrigin: ORIGIN, storageStatePath: "/nonexistent", reveal, capture: A.capture, judge: () => ({ ok: true }) };
    const session = await createPlaywrightWorkflowDriver({ loadPlaywright: jsdomPlaywright(mount), timeoutMs, quietMs: 60 }).open(policy);
    try {
        return (await session.visit(A.routes[0].path)).snapshot as Record<string, Array<{ attrs: Record<string, string | null>; parts: Record<string, string | null> }>>;
    } finally {
        await session.close();
    }
}

const failed = (snapshot: unknown, draftChargeId = DRAFT) => A.assert("child_financials", snapshot as never, { draftChargeId }).filter((c) => !c.ok).map((c) => c.check);

beforeEach(() => {
    net = new EventEmitter();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("the historical-draft UI capture over the real Financials card", () => {
    it.each(["compact", "standard"])("%s placement: the record's initial render has no ledger rows — Details is the only way to them", async (density) => {
        const snap = await visit({ density, reveal: [] });
        expect(snap.ledger_rows).toEqual([]);
        expect(snap.details_surfaces).toEqual([]);
        expect(snap.period_toggles).toEqual([]);
        expect(snap.details_actions).toHaveLength(1); // the control the adapter now opens is really there
        expect(failed(snap)).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
    });

    it("the pre-fix reveal (period disclosures only) reproduces the governed run's capture: ledger_rows=0", async () => {
        const snap = await visit({ reveal: PRE_FIX_REVEAL });
        expect(snap.ledger_rows).toEqual([]);
        expect(failed(snap).length).toBeGreaterThan(0);
    });

    it.each(["compact", "standard"])("%s placement: Details, then the collapsed March period, shows the draft once at the template price, still a draft", async (density) => {
        const snap = await visit({ density });
        expect(snap.details_surfaces).toHaveLength(1);
        expect(snap.ledger_rows.map((r) => r.attrs["data-financials-ledger-row"]).sort()).toEqual([DRAFT, POSTED].sort());
        const draft = snap.ledger_rows.find((r) => r.attrs["data-financials-ledger-row"] === DRAFT)!;
        expect(draft.parts.amount).toContain((TEMPLATE_AMOUNT_CENTS / 100).toFixed(2));
        expect(draft.parts.state).toBe("scheduled");
        expect(failed(snap)).toEqual([]);
    });

    it("the draft absent from the account: zero matching rows, the assertion fails", async () => {
        const snap = await visit({ deepRows: [POSTED_ROW] });
        expect(snap.details_surfaces).toHaveLength(1);
        expect(failed(snap)).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
    });

    it("the draft at the Catalog price (the hazard) fails, as does the same-name Catalog price as a charge", async () => {
        const snap = await visit({ deepRows: [ledgerRow(DRAFT, "2026-03-16", CATALOG_AMOUNT_CENTS, "draft"), POSTED_ROW] });
        const f = failed(snap);
        expect(f.some((c) => c.includes("template price"))).toBe(true);
        expect(f.some((c) => c.includes("is not a charge on the child (rows=1)"))).toBe(true);
    });

    it("the draft posted is not a draft", async () => {
        const snap = await visit({ deepRows: [ledgerRow(DRAFT, "2026-03-16", TEMPLATE_AMOUNT_CENTS, "posted"), POSTED_ROW] });
        expect(failed(snap).some((c) => c.includes("still a draft (state=not-a-draft)"))).toBe(true);
    });

    it("identity mismatch: rows rendered for one charge never satisfy the domain read's other charge id", async () => {
        const snap = await visit();
        expect(failed(snap, "7a1b2c3d-0000-4000-8000-00000000beef")).toContain("ui historical draft row draft=7a1b2c3d-0000-4000-8000-00000000beef rendered once (found 0)");
        expect(failed(snap, "")).toEqual(["ui historical draft: no draft charge id from the domain read"]);
    });

    it("an account read that never lands fails the visit at the bound — no capture is judged", async () => {
        await expect(visit({ read: "never", timeoutMs: 400 })).rejects.toThrow(/network-quiet/);
    });

    it("an account read that fails shows only the projection's own rows — never the draft — and the assertion fails", async () => {
        const snap = await visit({ read: "fails" });
        expect(snap.ledger_rows.map((r) => r.attrs["data-financials-ledger-row"])).toEqual([POSTED]);
        expect(failed(snap)).toContain(`ui historical draft row draft=${DRAFT} rendered once (found 0)`);
    });
});
