/**
 * THE SURFACE AND THE REGISTRY MUST AGREE ABOUT THE GRAIN THEY THEMSELVES EXPOSE.
 *
 * The Financials account card is customer-grain. Every command it mounts is therefore dispatched
 * at `customer`, and `checkContext` refuses an undeclared grain BEFORE the action runs — so a
 * control the surface offers can reach a 400 without any of its own code executing. That is how
 * the whole held-money lifecycle was unreachable in production, and how `charge.add` still
 * refuses a household with no child.
 *
 * This is a CENSUS, not a spot check. It reads the command keys the two account-surface
 * components actually render and fails if that set changes, so a new control cannot be mounted
 * without this proof being re-read — and every key in it must be executable at the grain it is
 * offered from.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const HOST = "components/admin/focusPanel/cards/FinancialsCard.tsx";
const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";

/**
 * Every action key the account surface offers a control for, as written in this proof. A key that
 * appears in the source and not here — or here and not in the source — fails the census below.
 */
const MOUNTED_ACCOUNT_ACTIONS = [
    "billing.adjust_account",
    "billing.reallocate_responsibility",
    "billing.resolve_responsibility",
    "billing.reverse_adjustment",
    "charge.add",
    "charge.post",
    "charge.reverse",
    "deposit.hold",
    "deposit.release",
    "payment.apply_to_charge",
    "payment.record",
    "payment.refund",
    "payment.reverse_application",
] as const;

/** The keys the components mark their controls with, however the attribute is spelled. */
function mountedKeysInSource(): string[] {
    const source = read(HOST) + read(DETAIL);
    const found = new Set<string>();
    for (const re of [
        /data-financials-command="([a-z_]+\.[a-z_]+)"/g,
        /data-charge-command="([a-z_]+\.[a-z_]+)"/g,
        /data-financials-row-command="([a-z_]+\.[a-z_]+)"/g,
        /\bcommand="([a-z_]+\.[a-z_]+)"/g,
    ]) {
        for (const m of source.matchAll(re)) found.add(m[1]!);
    }
    return [...found].sort();
}

describe("the account surface's command census", () => {
    it("is the set this proof was written against", () => {
        expect(mountedKeysInSource()).toEqual([...MOUNTED_ACCOUNT_ACTIONS]);
    });
});

describe("every command the account surface mounts is executable at account grain", () => {
    for (const key of MOUNTED_ACCOUNT_ACTIONS) {
        it(`${key} declares customer`, () => {
            const action = getRegisteredAction(key);
            expect(action, `${key} is mounted but not registered`).toBeTruthy();
            expect(
                action!.supportedEntityTypes,
                `${key} is offered from a customer-grain surface but does not declare that grain`,
            ).toContain("customer");
        });
    }
});

/*
 * THE OTHER HALF OF THE RULE, and the reason this is not just "add customer everywhere": an
 * action that is NOT offered from an account keeps its own grain. These four live in the same
 * files as widened neighbours and are mounted elsewhere, so widening them would be claiming a
 * grain nothing dispatches.
 */
describe("an action nobody mounts from an account is not given the grain", () => {
    for (const key of [
        "billing.configure_responsibility",
        "billing.configure_expected_funding",
        "billing.attribute_payment",
        "billing.assign_policy",
    ]) {
        it(`${key} is not mounted from the account surface`, () => {
            expect(mountedKeysInSource()).not.toContain(key);
        });
    }
});
