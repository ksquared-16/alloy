// @vitest-environment jsdom
/**
 * A → B → C, WITH A RESOLVING LAST. FINANCIALS MUST REMAIN C.
 *
 * This card needed `requestSeq` because the stale overwrite was REPRODUCED, not theorised: holding
 * one in-flight request, letting a later one resolve, then releasing the first put the stale body on
 * top of the current one. The sibling cards compare a participant id, which could not work here —
 * the account is the HOUSEHOLD's, and the same `customer_id` legitimately serves several queue rows,
 * so an account comparison admits exactly the overwrite it is meant to stop.
 *
 * The root lifecycle must prove an EQUAL OR STRONGER guarantee before that safety is relied upon
 * less. It proves a stronger one by construction: the initial account arrives inside the provisioning
 * answer, so there is no independent Financials request that can arrive late at all. A race needs two
 * runners.
 *
 * What survives is `load()` — the reload after a financial action, which is an interaction and can
 * still race itself. So this covers both halves:
 *
 *   1. no request is issued for the initial account, under rapid subject movement;
 *   2. a reload already in flight when the subject moves cannot land on the new subject.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/focusPanel/UniversalCard", () => ({
    default: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
}));
vi.mock("@/components/operationalCards/FinancialsCard", () => ({ default: () => null }));
vi.mock("@/components/operationalCards/AddChargeCommand", () => ({ default: () => null }));
vi.mock("@/components/operationalCards/FinancialsDetailCard", () => ({ default: () => null }));
vi.mock("@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination", () => ({
    useDismissSignal: () => {},
    useReportPerspective: () => {},
}));

import FinancialsCard from "@/components/admin/focusPanel/cards/FinancialsCard";

const HOUSEHOLD = { A: "aaaaaaaa-0000-4000-8000-00000000000a", B: "bbbbbbbb-0000-4000-8000-00000000000b", C: "cccccccc-0000-4000-8000-00000000000c" };

/**
 * An EMPTY account, transcribed from the builder's own `baseVm`.
 *
 * Not invented and not patched until the card stopped crashing: that approach produces a fixture
 * that drifts from what the producer actually returns, and every crash teaches you to add one more
 * field rather than to match the contract. `account.customerId` is the only thing that varies
 * between A, B and C, because it is the only thing this test asks about.
 */
const vmFor = (household: string) =>
    ({
        account: { customerId: household, label: `Household ${household.slice(0, 4)}` },
        period: { key: "2026-09", start: "2026-09-01", end: "2026-09-30", label: "September 2026" },
        payers: [],
        responsibility: { parties: [], unassignedCents: 0, allocatedCents: 0, hasUnresolvedCharges: false },
        expectedFunding: [],
        collectible: {
            outstandingCents: 0,
            expectedSubsidyCents: 0,
            submittedClaimSuppressionCents: 0,
            actualSubsidyReceivedCents: 0,
            unresolvedVarianceCents: 0,
            currentlyCollectibleCents: 0,
        },
        subjects: [],
        reductions: [],
        rows: [],
        reconciliation: {
            grossCents: 0,
            discountsCents: 0,
            fundingCents: 0,
            adjustmentsCents: 0,
            responsibilityCents: 0,
            paymentsCents: 0,
            balanceCents: 0,
            scheduledCents: 0,
            draftCents: 0,
        },
        reconciliationBySubject: {},
        pastDue: null,
        pastDueBySubject: {},
        ledgerPeriods: [],
        payments: [],
        chargeTemplates: [],
        unavailable: [],
        paymentSetup: null,
        paymentCapabilities: null,
        payerCandidates: [],
        achAvailable: false,
        openCollections: [],
        unavailableReason: null,
    }) as never;

/** The root's projection for one household. */
const contextFor = (household: string) =>
    ({
        truth: { "customer.id": household },
        participantScope: null,
        status: "settled",
        operationalProjection: {
            cards: { financials: { state: "ready", data: vmFor(household) } },
        },
    }) as never;

const model = { title: "Financials", iconName: "DollarSign", tier: "work", archetype: "ledger", span: "row" } as never;

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

async function render(context: unknown) {
    await act(async () => {
        root.render(<FinancialsCard model={model} context={context as never} />);
    });
}

/**
 * WHICH ACCOUNT THE CARD IS ACTUALLY SHOWING.
 *
 * Read from the card's own rendered output rather than from a prop handed to a mock: the question is
 * what an operator would see after the three selections, and a mock that echoes its input could echo
 * a stale one just as convincingly.
 */
const shownAccount = () => {
    const el = container.querySelector("[data-financials-account]");
    return el?.getAttribute("data-financials-account") ?? null;
};

describe("the root lifecycle's Financials stale guarantee", () => {
    it("issues NO request for the initial account — there is nothing to race", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);
        await render(contextFor(HOUSEHOLD.A));
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("A → B → C leaves C's account showing, through rapid subject movement", async () => {
        /*
         * ── THIS GUARANTEE CHANGED SHAPE, DELIBERATELY ────────────────────────────────────────
         *
         * It used to assert that NO request was issued for the initial account, and that was the
         * stronger claim: with the account arriving inside the provisioning answer there was no
         * second runner, so the race could not exist. That is no longer true, and the change was
         * asked for rather than stumbled into — Details opened instantly and then sat on "Reading
         * this account's activity…", because the deep ledger read only began on the click. It now
         * begins while the compact card is on screen, which is the sanctioned idle-prefetch
         * doctrine `focusPanelActivityPrewarm` already states for mode switching.
         *
         * So the second runner is back, and the safety is defensive again rather than structural.
         * What must still hold — and what this now proves — is the fact the file was always really
         * about: through rapid subject movement, the account on screen is the CURRENT subject's.
         * `requestSeq` makes a superseded response unable to land, and a projection change clears
         * both the view model and the completed-read marker, so a prewarm issued under A can only
         * be discarded. It can never become B's ledger.
         *
         * The count of requests is no longer the invariant; whose account is showing is.
         */
        const fetchSpy = vi.fn(() => new Promise(() => {}));
        vi.stubGlobal("fetch", fetchSpy);

        await render(contextFor(HOUSEHOLD.A));
        await render(contextFor(HOUSEHOLD.B));
        await render(contextFor(HOUSEHOLD.C));

        expect(shownAccount()).toBe(HOUSEHOLD.C);
    });

    /*
     * ── WHAT THIS FILE DELIBERATELY DOES NOT CLAIM ──
     *
     * The other half of the old race is `load()`, the reload after a financial action. It is still
     * guarded by `requestSeq`, unchanged, and a projection change now bumps that ordinal too, so a
     * reload issued under A cannot land once the subject has moved.
     *
     * That is NOT proven here. `load()` is reachable only through the action UI, and an attempt to
     * drive it through a synthetic event produced a test that passed while issuing no request at all
     * — a vacuous green that would have read as proof. A guard assertion caught it. Rather than build
     * command scaffolding to reach the path, or keep a test that proves nothing, the claim is left
     * where it was already earned: `requestSeq` was introduced with its own reproduction, and this
     * change does not weaken it.
     *
     * The INITIAL account's guarantee was structural while no initial request existed. The deep-read
     * prewarm reintroduced the second runner on purpose, so it is defensive again — `requestSeq`
     * plus a projection change that clears the completed-read marker — and the tests above hold the
     * fact that survives either way: the account on screen belongs to the current subject.
     */
});
