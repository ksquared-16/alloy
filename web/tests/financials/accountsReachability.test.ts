/**
 * THE ACCOUNT LIST MUST STAY REACHABLE WHILE ITS OWN LEDGER IS OPEN.
 *
 * Kelly reported both operator paths into the Financials account experience dead. Measured on
 * deployed staging: Financials → Accounts landed with twelve rows and the first account's ledger
 * already open, an ordinary click on a second family TIMED OUT against
 * `.alloy-accounts-command-backdrop`, the selected row never changed, and the ledger went on
 * showing the first household over a list whose selected row had scrolled out of sight.
 *
 * The cause was a selector, not a handler: the row is a plain button whose `onClick` calls
 * `onSelect`, and it never ran because a full-viewport scrim sat over it. The scrim is armed by
 * `:has([data-financials-overlay])`, written when Details was a layer the operator PUSHED. Once
 * convergence made Details the floor of this host, "any overlay" became "always", and the scrim
 * that exists to protect a command became a permanent lid on the account list.
 *
 * ── WHY THESE GATES ARE NOT STRING CHECKS ──
 *
 * `detailsAreTheSurface === true` was true throughout the outage; asserting it proves nothing. So
 * the chain is exercised end to end instead: the rule decides a role, the role becomes an
 * attribute on a real DOM node, and the STYLESHEET'S OWN SELECTORS are matched against that node.
 * `Element.matches` answers the only question that mattered — does the scrim rule apply to this
 * element — and it answers it from the shipped CSS rather than from a description of it.
 */
/**
 * @vitest-environment jsdom
 *
 * A real DOM, because the question is whether a shipped SELECTOR applies to a rendered node — and
 * `Element.matches` is the only honest way to ask it. Vitest's own jsdom environment supplies it,
 * so this needs no `jsdom` import and no new dependency.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { financialsSurfaceRole } from "@/lib/financials/workspace/financialsSurfaceRole";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const CSS = "app/adminV2/components/alloyOsRuntime.css";
const CARD = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const ACCOUNTS = "app/adminV2/financials/sections/FinancialsAccounts.tsx";

/** Every selector in the stylesheet that arms the account-list scrim. */
function scrimSelectors(): string[] {
    return [...read(CSS).matchAll(/^([^\n{]*\.alloy-accounts-command-backdrop[^\n{]*)\{/gm)]
        .map((m) => m[1]!.trim())
        .filter((sel) => sel.includes(":has("));
}

/** Every selector that turns an overlay into a fixed, centred focused layer. */
function focusedLayerSelectors(): string[] {
    return [...read(CSS).matchAll(/^([^\n{]*\.alloy-accounts-command-host[^\n{]*)\{\s*([^}]*)\}/gm)]
        .filter((m) => /position:\s*fixed/.test(m[2]!))
        .map((m) => m[1]!.trim());
}

/** The Accounts pane, with one Financials surface in it at the given role. */
function accountsPane(role: "floor" | "command") {
    document.body.innerHTML = `
        <div class="alloy-accounts-account-card alloy-accounts-command-host" data-financials-command-host="true">
            <div class="alloy-accounts-command-backdrop" data-financials-command-backdrop="true"></div>
            <div class="alloy-os-financials" data-financials-card="true"
                 data-financials-overlay="${role === "floor" ? "detail" : "add_charge"}"
                 ${role === "floor" ? 'data-financials-surface-role="floor"' : ""}></div>
        </div>
        <button data-financials-account-row="other-household"></button>`;
    return {
        backdrop: document.querySelector(".alloy-accounts-command-backdrop")!,
        overlay: document.querySelector("[data-financials-overlay]")!,
    };
}

describe("the Accounts floor is not a command, and does not scrim the list", () => {
    it("the shipped stylesheet has a scrim rule to be wrong about", () => {
        expect(scrimSelectors().length, "no scrim selector found — this gate would pass vacuously").toBeGreaterThan(0);
        expect(focusedLayerSelectors().length, "no focused-layer selector found").toBeGreaterThan(0);
    });

    it("the resting account ledger arms NO scrim over the account list", () => {
        const { backdrop } = accountsPane("floor");
        for (const sel of scrimSelectors()) {
            expect(
                backdrop.matches(sel),
                `the account list is covered while only the ledger is open — ${sel}`,
            ).toBe(false);
        }
    });

    it("and is not lifted out of the pane as a fixed, centred layer", () => {
        const { overlay } = accountsPane("floor");
        for (const sel of focusedLayerSelectors()) {
            expect(
                overlay.matches(sel),
                `the account's own ledger floats over the list it belongs to — ${sel}`,
            ).toBe(false);
        }
    });

    it("a real command still gets both, because that is what the scrim is for", () => {
        const { backdrop, overlay } = accountsPane("command");
        expect(
            scrimSelectors().some((sel) => backdrop.matches(sel)),
            "a command with no scrim leaves the list live underneath a focused layer",
        ).toBe(true);
        expect(
            focusedLayerSelectors().some((sel) => overlay.matches(sel)),
            "a command must still present as a focused layer",
        ).toBe(true);
    });
});

describe("the role the attribute carries is the host's, decided once", () => {
    it("the workspace floor is a floor only while nothing is pushed above it", () => {
        expect(financialsSurfaceRole({ detailsAreTheSurface: true, stackDepth: 1 })).toBe("floor");
        expect(
            financialsSurfaceRole({ detailsAreTheSurface: true, stackDepth: 2 }),
            "Add Charge over the account IS a command",
        ).toBe("command");
    });

    it("the Focus Panel declares no floor, so Details there stays an ordinary layer", () => {
        expect(financialsSurfaceRole({ detailsAreTheSurface: false, stackDepth: 1 })).toBe("command");
    });

    it("the card publishes the rule's answer rather than restating it", () => {
        const card = read(CARD).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(card).toMatch(/data-financials-surface-role=\{financialsSurfaceRole\(/);
        expect(card).toMatch(/stackDepth:\s*stack\.length/);
    });

    it("the account row is an ordinary button, so nothing but a cover can stop it", () => {
        const acc = read(ACCOUNTS).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(acc, "the row selects the account it names").toMatch(
            /onClick=\{\(\) => onSelect\(account\.customerId\)\}/,
        );
    });

    it("and the pane follows the selection, so a switch cannot leave the old ledger up", () => {
        const acc = read(ACCOUNTS).replace(/\/\*[\s\S]*?\*\//g, "");
        /*
         * The other half of reachability. Unblocking the row is worth nothing if the detail goes on
         * showing the previous household — which is exactly what the operator saw while the scrim
         * was up: a ledger for a family whose row had scrolled out of sight.
         *
         * Two things guarantee it and both are asserted, because either alone is insufficient: the
         * pane is FED the selected account, and it is KEYED by it, so a switch remounts rather than
         * reusing a tree still holding the previous account's read.
         */
        const pane = acc.slice(acc.indexOf("<FinancialsAccountDetail"));
        expect(pane.slice(0, 400), "the pane is fed the selected account").toMatch(
            /customerId=\{selected\}/,
        );
        expect(pane.slice(0, 400), "and remounts when it changes").toMatch(
            /key=\{`account-\$\{selected\}`\}/,
        );
    });
});
