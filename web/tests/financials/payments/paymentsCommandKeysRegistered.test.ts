import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { FINANCIAL_TRANSACTION_ACTIONS } from "@/lib/financials/commands/financialTransactionCommands";
import { financialPaymentActions } from "@/lib/adminV2/actions/definitions/financialPaymentActions";
import { depositHoldActions } from "@/lib/adminV2/actions/definitions/depositHoldActions";
import { autopayActions } from "@/lib/adminV2/actions/definitions/autopayActions";
import { paymentMethodActions } from "@/lib/adminV2/actions/definitions/paymentMethodActions";
import { providerInstallationActions } from "@/lib/adminV2/actions/definitions/providerInstallationActions";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

/**
 * A MOUNTED CONTROL MAY NOT NAME AN ACTION THAT DOES NOT EXIST.
 *
 * `payment.apply` was carried for a long time by the command table whose own contract is that the
 * keys are "spelled once, so no host can invent a variant" — while the registered action has always
 * been `payment.apply_to_charge`. The label reached the DOM as `data-charge-command`, so mounted
 * instrumentation reported a key the registry does not contain.
 *
 * Nothing dispatched it, which is exactly why it survived: a dead spelling costs nothing until
 * someone reads the telemetry, or writes a second action to make the name true. This gate is
 * cheaper than either.
 */
const REGISTERED = new Set<string>([
    ...financialPaymentActions,
    ...depositHoldActions,
    ...autopayActions,
    ...paymentMethodActions,
    ...providerInstallationActions,
].map((a) => a.actionKey));

describe("every Payments command key is a registered action", () => {
    it("the registry is not empty — otherwise this gate passes by vacuity", () => {
        expect(REGISTERED.size).toBeGreaterThan(10);
        for (const key of ["payment.apply_to_charge", "payment.record", "payment.refund", "deposit.hold"]) {
            expect(REGISTERED.has(key), `${key} is registered`).toBe(true);
        }
    });

    it("payment.apply is not a registered action, and nothing may name it", () => {
        expect(REGISTERED.has("payment.apply")).toBe(false);
        for (const rel of [
            "lib/financials/commands/financialTransactionCommands.ts",
            "components/operationalCards/FinancialsDetailCard.tsx",
            "components/admin/focusPanel/cards/FinancialsCard.tsx",
        ]) {
            /* The exact key, not a prefix: `payment.apply_to_charge` legitimately starts with it. */
            expect(read(rel), `${rel} names the dead alias`).not.toMatch(/"payment\.apply"/);
        }
    });

    /**
     * The Payments keys in the shared command table must be registered actions. Non-Payments keys
     * (charges, billing, responsibility) belong to other registries and are out of scope here.
     */
    it("the command table's Payments keys all resolve", () => {
        const paymentKeys = Object.values(FINANCIAL_TRANSACTION_ACTIONS)
            .filter((k) => k.startsWith("payment.") || k.startsWith("deposit.") || k.startsWith("autopay."));
        expect(paymentKeys.length, "the table carries Payments keys").toBeGreaterThan(0);
        for (const key of paymentKeys) {
            expect(REGISTERED.has(key), `${key} is not a registered Payments action`).toBe(true);
        }
    });

    /**
     * And the mounted surfaces' own `data-financials-command` / RowAction `command` labels. Read
     * from source rather than rendered: this is about what the label SAYS, which is a source fact.
     */
    it("mounted Payments controls label themselves with registered keys", () => {
        const surfaces = [
            "components/operationalCards/FinancialsDetailCard.tsx",
            "components/admin/focusPanel/cards/FinancialsCard.tsx",
        ];
        const seen: string[] = [];
        for (const rel of surfaces) {
            const src = read(rel);
            for (const m of src.matchAll(/(?:command|data-financials-command)=["{]"?((?:payment|deposit|autopay|provider)\.[a-z_]+)"/g)) {
                seen.push(m[1]);
            }
        }
        expect(seen.length, "at least one Payments command label is mounted").toBeGreaterThan(0);
        for (const key of new Set(seen)) {
            expect(REGISTERED.has(key), `mounted label ${key} is not a registered action`).toBe(true);
        }
    });
});
