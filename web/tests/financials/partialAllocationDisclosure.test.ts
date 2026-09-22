/**
 * A NAME IS NOT THE SAME AS "FULLY OWED BY THIS PERSON" (§7A).
 *
 * ── THE DEFECT, AS MEASURED ──────────────────────────────────────────────────────────────────
 *
 * Resolving a $75.00 obligation under an arrangement naming one $18.00 fixed share produced TWO
 * allocations — $18.00 owed by Cert Certhouse and $57.00 owed by nobody — and the ledger row said:
 *
 *     Cert Certhouse
 *
 * The engine knew (`unassignedCents: 5700`); the projection carried only `{name, unassigned}`; the
 * cell rendered the name and the remainder vanished. An operator read a partially allocated
 * obligation as fully owned, which is the most expensive kind of wrong here: the unowned remainder
 * is exactly the part that still needs work.
 *
 * ── WHERE THE FIX LIVES ──────────────────────────────────────────────────────────────────────
 *
 * In the canonical responsibility projection and the ONE shared ledger cell. A component computing
 * "is this partial?" for itself would be a second opinion about what is owed, and the two hosts
 * would eventually disagree.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("THE GATE — the projection carries both halves", () => {
    const vm = src("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");

    /* Summing the allocations already in hand — not a second read, not a second opinion. */
    it("accumulates the assigned and unassigned cents per charge", () => {
        const at = vm.indexOf("const byCharge = new Map");
        expect(at, "the per-charge index is findable").toBeGreaterThan(0);
        const block = vm.slice(at, at + 1200);
        expect(block).toContain("entry.unassignedCents += amount");
        expect(block).toContain("entry.assignedCents += amount");
    });

    it("puts both amounts on the row beside the name", () => {
        expect(vm).toContain("row.responsibilityAssignedCents = owned?.assignedCents ?? 0");
        expect(vm).toContain("row.responsibilityUnassignedCents = owned?.unassignedCents ?? 0");
    });
});

describe("THE GATE — the shared cell makes PARTIAL unmistakable", () => {
    const ledger = src("components/operationalCards/FinancialsLedger.tsx");

    /*
     * PARTIAL IS ITS OWN STATE. Four were distinguishable before — named, unassigned,
     * not-allocated, not-applicable — and the fifth was being collapsed into "named".
     */
    it("marks partial as a distinct responsibility state", () => {
        expect(ledger).toContain('partial ? "partial"');
        for (const state of ['"not-applicable"', '"named"', '"unassigned"', '"not-allocated"']) {
            expect(ledger, `the existing state ${state} survives`).toContain(state);
        }
    });

    /* Partial is derived from canonical truth: a name AND a remainder greater than zero. */
    it("derives partial from a named party plus an unowned remainder", () => {
        expect(ledger).toContain("const partial = named && remainder > 0");
        expect(ledger).toContain("row.responsibilityUnassignedCents ?? 0");
    });

    /* The remainder is visible in the cell, not only on a hover. */
    it("shows the unowned amount in the row rather than hiding it", () => {
        expect(ledger).toContain("data-financials-responsibility-remainder");
        expect(ledger).toContain("unassigned`}");
        expect(ledger, "and both numbers are available together").toMatch(/title=\{title\}/);
    });

    /* Still a cell, not a paragraph: one name and one short remainder. */
    it("keeps the cell concise", () => {
        const at = ledger.indexOf("data-financials-responsibility-remainder");
        const around = ledger.slice(at - 200, at + 260);
        expect(around).not.toMatch(/Gross|Net obligation|Billing period/);
    });
});

describe("THE GATE — both deep hosts state it from the same projection", () => {
    /* Neither host recomputes the state; both carry the same two fields into the shared cell. */
    it("carries the amounts through the Focus Panel and the Workspace alike", () => {
        for (const rel of ["components/operationalCards/FinancialsDetailCard.tsx",
                           "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"]) {
            expect(src(rel), `${rel} carries the assigned half`).toContain("responsibilityAssignedCents");
            expect(src(rel), `${rel} carries the unowned half`).toContain("responsibilityUnassignedCents");
        }
    });

    /* And no host decides partiality for itself. */
    it("leaves the partial decision to the shared cell", () => {
        for (const rel of ["components/operationalCards/FinancialsDetailCard.tsx",
                           "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx"]) {
            expect(src(rel), `${rel} does not decide partiality`).not.toContain("const partial =");
        }
    });
});
