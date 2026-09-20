/**
 * THE PREPAID POSITION, AS AN OPERATOR SEES IT.
 *
 * The model was certified in the previous pass. These lock the two claims a SURFACE can get wrong
 * in ways that cost money or trust:
 *
 *   1. `owes $0 with $200 available` must never render as `balance −$200`. The first is an account
 *      in good standing holding funds; the second says the organisation owes the family money.
 *
 *   2. Held money must be its OWN figure and never summed into available prepaid. W4 made held
 *      deposits measurable; the risk moved from "claiming a zero you cannot measure" to "offering a
 *      family's deposit for allocation because two figures were added together". The
 *      `heldSupported` guard still stands, because a payload from before W4 measures nothing.
 *
 * And the density rule: zero is SILENCE. A permanent "$0.00 available" on every ordinary account is
 * noise occupying a slot meant for a fact.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveAccountPrepaidPosition } from "@/lib/financials/prepaid/availableFunds";
import type { PaymentView } from "@/lib/financials/paymentApplicationView";

const pay = (over: Partial<PaymentView>): PaymentView =>
    ({
        paymentId: "p1", status: "posted", amountCents: 50_000, currency: "USD",
        receivedAt: "2026-09-01", paymentMethod: "ach", processor: null,
        processorTransactionId: null, referenceNumber: null, payerCustomerId: "c1",
        payerLabel: "Dana Alvarez", refundedCents: 0, activeAppliedCents: 0,
        unappliedCents: 50_000, applications: [], ...over,
    }) as PaymentView;

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/*
 * SOURCE WITH THE PROSE REMOVED.
 *
 * These files explain themselves at length, and the explanations name the very things the code must
 * not do — "no Manage deposit, no allocation control" is a sentence that must be allowed to exist
 * in a comment while the control it forbids must not exist in the markup. Asserting over raw text
 * cannot tell those apart, and the first version of this file failed on its own documentation.
 */
const code = (rel: string) =>
    src(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

describe("the surface consumes the authority; it does not recompute it", () => {
    /*
     * A card that summed unapplied cents itself would be a second answer to "what may this family
     * spend", and it would get the PENDING case wrong — which is the one that can offer money that
     * never arrives.
     */
    it("projects the position through resolveAccountPrepaidPosition in the read model", () => {
        const vm = src("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toContain("resolveAccountPrepaidPosition");
        expect(vm).toContain("vm.prepaid =");
    });

    /* No component may add unapplied money up on its own. */
    it("adds no prepaid arithmetic to the presentation components", () => {
        for (const f of [
            "components/operationalCards/FinancialsCard.tsx",
            "components/operationalCards/FinancialsDetailCard.tsx",
        ]) {
            const text = code(f);
            expect(text, `${f} does not sum unapplied money`).not.toMatch(/unappliedCents\s*\+/);
            expect(text, `${f} does not reduce over payments`).not.toMatch(/reduce\([^)]*unapplied/);
        }
    });

    it("renders the adapter's figure, which comes from the authority", () => {
        const adapter = src("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        // Optional-chained: a payload from a server predating this field must not crash the card.
        expect(adapter).toMatch(/vm\.prepaid\??\.availableCents/);
    });
});

describe("THE GATE — zero is silence", () => {
    /*
     * The adapter sends null rather than "$0.00", so an ordinary account carries no prepaid metric
     * at all — the same density rule that removed Autopay from the strip rather than rendering it
     * as a standing "not available".
     */
    it("sends null when there is nothing available, never a zero string", () => {
        const adapter = src("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).toMatch(/availablePrepaid:\s*\n?\s*\(?vm\.prepaid\??\.availableCents[^)]*\)?\s*>\s*0\s*\?/);
        // The false branch is null — never a formatted zero.
        expect(adapter).toMatch(/>\s*0\s*\?[\s\S]{0,120}:\s*null/);
    });

    it("renders the metric only when a value exists, on both surfaces", () => {
        expect(src("components/operationalCards/FinancialsDetailCard.tsx"))
            .toMatch(/\{period\.availablePrepaid \? \(/);
        expect(src("components/operationalCards/FinancialsCard.tsx"))
            .toMatch(/\{period\.availablePrepaid \? \(/);
    });
});

describe("THE GATE — two facts, never one netted number", () => {
    it("keeps available funds out of the balance, so $0 owed with $200 held is not −$200", () => {
        const position = resolveAccountPrepaidPosition([pay({ unappliedCents: 20_000 })]);
        expect(position.availableCents).toBe(20_000);
        // The adapter reads `reconciliation.balanceCents` for currentBalance and `vm.prepaid` for
        // this — two different sources, so one can never become the negative of the other.
        const adapter = src("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).toContain("currentBalance: money(reconciliation.balanceCents, currency)");
        expect(adapter).not.toMatch(/balanceCents\s*-\s*.*prepaid/);
        expect(adapter).not.toMatch(/prepaid.*-\s*balanceCents/);
    });
});

describe("THE GATE — held money is shown, and never merged into available", () => {
    /*
     * THIS GATE CHANGED SHAPE IN W4, AND ITS PURPOSE DID NOT.
     *
     * It used to forbid any held-deposit figure, because `heldSupported: false` meant the platform
     * could not tell a restricted deposit from ordinary prepaid money and "$0 held" would have been
     * a claim with no basis. W4 gives it a basis.
     *
     * What it now locks is the thing that would actually lose money: held funds must be their own
     * figure, guarded by `heldSupported`, never summed into available prepaid, and never netted into
     * Current Balance.
     */
    it("reports held money as a measurement now that the capability exists", () => {
        const position = resolveAccountPrepaidPosition([pay({})]);
        expect(position.heldSupported).toBe(true);
    });

    it("renders held funds only when the capability says the figure means something", () => {
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        /* The guard is the point: without it a pre-W4 payload would render "$0 held". */
        expect(adapter).toMatch(/heldFunds:\s*\n?\s*vm\.prepaid\?\.heldSupported/);
    });

    it("never sums held money into available prepaid", () => {
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).not.toMatch(/availableCents\s*\+\s*[^)]*heldCents/);
        expect(adapter).not.toMatch(/heldCents\s*\+\s*[^)]*availableCents/);

        /* And the authority itself carves held OUT of available rather than adding it in. */
        const authority = code("lib/financials/prepaid/availableFunds.ts");
        expect(authority).toMatch(/unappliedCents\s*-\s*held/);
    });

    it("never nets held money into Current Balance", () => {
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).toContain("currentBalance: money(reconciliation.balanceCents, currency)");
        expect(adapter).not.toMatch(/balanceCents\s*-\s*[^)]*held/i);
        expect(adapter).not.toMatch(/held[^)]*-\s*balanceCents/i);
    });

    it("shows held funds as their own line on both surfaces", () => {
        for (const f of [
            "components/operationalCards/FinancialsCard.tsx",
            "components/operationalCards/FinancialsDetailCard.tsx",
        ]) {
            const text = code(f);
            expect(text, `${f} renders the held figure`).toMatch(/period\.heldFunds \? \(/);
            expect(text, `${f} keeps it separate from available prepaid`).toMatch(/period\.availablePrepaid \? \(/);
        }
    });
});
