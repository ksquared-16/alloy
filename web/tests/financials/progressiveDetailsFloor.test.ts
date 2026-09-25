/**
 * THE PROGRESSIVE ACCOUNT DETAILS FLOOR — no FALSE Details.
 *
 * F44's absolute (Details is ABSENT, then COMPLETE) is retired. It recorded a real failure —
 * placeholder ledger rows rewriting into real ones, the "double load" — but it solved it by making
 * the operator wait for the whole deep read, measured at ~1,030ms on an ordinary no-dwell click.
 *
 * The successor is NO FALSE DETAILS: a pending floor may state the real account, real structure,
 * reserved figures and the ledger's real columns; it may never state a row, a zero, the previous
 * account's anything, or a command whose authority has not resolved.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hydratingFinancialsEvidence } from "@/lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const executable = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
const CARD = () => executable(read("components/admin/focusPanel/cards/FinancialsCard.tsx"));
const FLOOR = () => read("components/operationalCards/FinancialsDetailCard.tsx");
const pendingBranch = () => {
    const c = CARD();
    const from = c.slice(c.indexOf("detailsAreTheSurface && !(vm && reconciliation)"));
    return from.slice(0, from.indexOf('if (overlay === "detail" && vm && reconciliation)'));
};

describe("B — the floor mounts on selection, not on truth", () => {
    it("B: the pending branch is reached while the view model is absent", () => {
        expect(CARD()).toMatch(/if \(overlay === "detail" && detailsAreTheSurface && !\(vm && reconciliation\)/);
    });

    it("B: and it names the account it belongs to, by canonical id", () => {
        expect(pendingBranch()).toContain('data-financials-detail-account={subjectKey ?? ""}');
        expect(pendingBranch(), "identity is never the display name").not.toMatch(/displayName|householdName/);
    });
});

describe("C — reserved figures, never zero", () => {
    it("C: every reserved figure is an em dash and no amount appears anywhere", () => {
        const ev = hydratingFinancialsEvidence();
        const text = JSON.stringify(ev);
        expect(text).not.toMatch(/\$\s?\d/);
        expect(text).not.toMatch(/"0\.00"/);
        expect(ev.period.currentBalance).toBe("\u2014");
        expect(ev.period.dueNow).toBe("\u2014");
        expect(ev.period.paymentsReceived).toBe("\u2014");
        expect(ev.period.familyResponsibility).toBe("\u2014");
        expect(ev.pastDue, "past due says it does not know rather than None").toBeNull();
    });
});

describe("K/L — a failed read is UNAVAILABLE, and the operator can still move", () => {
    it("K: the floor distinguishes still-reading from could-not-be-read", () => {
        const b = pendingBranch();
        expect(b, "the wrapper states which of the two this is").toContain(
            'data-financials-detail-truth={reservingAccount ? "not_yet_known" : "unavailable"}',
        );
        expect(b, "and the surface is told, so it stops saying it is reading").toContain("unavailable={!reservingAccount}");
    });

    it("K: and an unavailable ledger never claims the account is empty", () => {
        const floor = FLOOR();
        const region = floor.slice(floor.indexOf("data-financials-ledger-hydrating"));
        const head = region.slice(0, region.indexOf("</div>"));
        expect(head).toContain('data-financials-ledger-unavailable="true"');
        expect(head, "an absence of rows is not evidence of no activity").not.toContain("Nothing charged yet");
        expect(head, "and still no fabricated transaction").not.toMatch(/LedgerRow|placeholderRow|skeletonRow/);
        expect(head, "the real columns still commit, so geometry holds").toContain("<FinancialsLedgerHead />");
    });

    it("L: the floor is rendered by the host beside the account list, so switching survives it", () => {
        const host = executable(read("app/adminV2/financials/sections/FinancialsAccounts.tsx"));
        expect(host, "rows and the detail are siblings under one surface").toContain("<AccountQueueRow");
        expect(host, "and selection is the host's state, not the card's").toContain("onSelect={setChosen}");
    });
});

describe("16 — the four states are the same four the account rows already use", () => {
    it("the list and the floor cannot use different uncertainty semantics", () => {
        const rail = read("lib/financials/workspace/accountsRail.ts");
        expect(rail).toContain('export type AccountFinancialTruth = "known" | "known_zero" | "not_yet_known" | "unavailable"');
        const b = pendingBranch();
        for (const state of ["not_yet_known", "unavailable"]) {
            expect(b, `the floor speaks the row doctrine's "${state}"`).toContain(state);
        }
    });
});

describe("M — one canonical implementation", () => {
    it("pending and settled are the same product surface", () => {
        const c = CARD();
        expect((c.match(/<FinancialsDetailCard/g) ?? []).length, "both states render it").toBeGreaterThanOrEqual(2);
        for (const forbidden of ["PendingFinancialsDetailCard", "AccountsFinancialsLoadingCard", "FinancialsAccountWorkspaceDetail"]) {
            expect(c).not.toContain(forbidden);
        }
    });
});
