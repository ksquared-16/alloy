/**
 * THREAD 1 — the financial transaction spine, certified through the RUNNING APP.
 *
 * Add Charge → draft → post → balance, then correction lineage, driven as an authenticated operator
 * against the certification tenant. Every call here is the exact contract `FinancialsCard` issues:
 * `POST /api/admin/actions/execute` for `charge.add` / `charge.post` / `charge.reverse`, and
 * `GET /api/admin/financials/card` for the composed read model the three densities render. Nothing
 * is written directly to the database, so authentication, org resolution, `requireAdminOrOps`, the
 * registered-action registry, the services and the DB guarantees are all in the path.
 *
 * Requirements certified here:
 *   Phase 4 A–E  Add Charge creates a DRAFT; a draft is not owed; posting makes it owed; the read
 *                model and the balance agree with what persisted.
 *   R6           the ledger carries the relationship between a correction and its original.
 *   R7           the original stops offering Reverse once a live reversal exists — asserted on
 *                `offersReverse`, the read model field the card renders the button from, so the
 *                certification checks the deciding value rather than restating the rule.
 *   R8           a second reversal is refused, through the operator's own path.
 *
 * Fixture: certification/fixtures/financials-charge-spine.sql.
 */
import { expect, test } from "@playwright/test";

const ORG_HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const CHILD = "fc500000-0000-4000-8000-0000000c0002";
const TEMPLATE = "fc500000-0000-4000-8000-0000000d0001";

type LedgerRow = {
    chargeId: string;
    amountCents: number;
    status: string;
    lifecycleStatus: string;
    correctsChargeId: string | null;
    correctionKind: string | null;
    reversedByChargeId: string | null;
    /** The read model's own answer to "does this row offer Reverse" — what the card renders. */
    offersReverse: boolean;
};
type CardVm = {
    rows: LedgerRow[];
    reconciliation: { responsibilityCents: number; balanceCents: number; draftCents: number };
};

test.describe("financials — charge lifecycle through the operator's own surface", () => {
    test("add → draft → post → balance, then one reversal and no more", async ({ page }) => {
        const execute = async (body: Record<string, unknown>) => {
            const res = await page.request.post("/api/admin/actions/execute", { data: body });
            return { status: res.status(), json: (await res.json()) as Record<string, any> };
        };
        const readCard = async (): Promise<CardVm> => {
            const res = await page.request.get(
                `/api/admin/financials/card?customer_id=${ORG_HOUSEHOLD}`,
            );
            expect(res.status(), "the card read model must be reachable as the operator").toBe(200);
            return ((await res.json()) as { vm: CardVm }).vm;
        };

        // The session is the captured operator's; a cold navigation proves it is accepted by SSR
        // before any money is touched.
        await page.goto("/workspace");

        const before = await readCard();
        const startingBalance = before.reconciliation.balanceCents;

        // ── A · Add Charge creates a DRAFT ───────────────────────────────────────────────────────
        const added = await execute({
            action_key: "charge.add",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { customer_member_id: CHILD, customer_id: ORG_HOUSEHOLD, template_id: TEMPLATE },
        });
        expect(added.json.ok, `charge.add failed: ${JSON.stringify(added.json)}`).toBe(true);
        const chargeId = added.json.data?.execution_result?.affected_id
            ?? added.json.data?.affected_id;
        expect(chargeId, "Add Charge must report the charge it created").toBeTruthy();

        const afterAdd = await readCard();
        const draftRow = afterAdd.rows.find((r) => r.chargeId === chargeId)!;
        expect(draftRow, "the new charge must appear in the ledger").toBeTruthy();
        expect(draftRow.status).toBe("draft");
        expect(draftRow.lifecycleStatus).toBe("draft");

        // ── B · A DRAFT IS NOT OWED. The balance has not moved; the draft is stated separately. ──
        expect(afterAdd.reconciliation.balanceCents).toBe(startingBalance);
        expect(afterAdd.reconciliation.draftCents).toBe(
            before.reconciliation.draftCents + draftRow.amountCents,
        );

        // ── C · Posting makes it owed ────────────────────────────────────────────────────────────
        const posted = await execute({
            action_key: "charge.post",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: chargeId, charge_label: "certification fee" },
        });
        expect(posted.json.ok, `charge.post failed: ${JSON.stringify(posted.json)}`).toBe(true);

        const afterPost = await readCard();
        const postedRow = afterPost.rows.find((r) => r.chargeId === chargeId)!;
        expect(postedRow.status).toBe("posted");
        expect(postedRow.lifecycleStatus).toBe("posted");
        expect(afterPost.reconciliation.balanceCents).toBe(startingBalance + postedRow.amountCents);
        // The transition the card offers on posted money that stands.
        expect(postedRow.offersReverse).toBe(true);

        // ── D · Reverse once ─────────────────────────────────────────────────────────────────────
        const reversed = await execute({
            action_key: "charge.reverse",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: chargeId, charge_label: "certification fee", kind: "reversal" },
        });
        expect(reversed.json.ok, `charge.reverse failed: ${JSON.stringify(reversed.json)}`).toBe(true);

        const afterReverse = await readCard();
        const originalRow = afterReverse.rows.find((r) => r.chargeId === chargeId)!;
        const reversalRow = afterReverse.rows.find((r) => r.correctsChargeId === chargeId)!;

        // R6 — the ledger carries the relationship, in both directions.
        expect(reversalRow, "the reversal must appear as its own ledger line").toBeTruthy();
        expect(reversalRow.correctionKind).toBe("reversal");
        expect(reversalRow.amountCents).toBe(-postedRow.amountCents);
        expect(originalRow.reversedByChargeId).toBe(reversalRow.chargeId);

        // R4 — derived, not rewritten: the persisted status is still `posted`.
        expect(originalRow.status).toBe("posted");
        expect(originalRow.lifecycleStatus).toBe("reversed");

        // R5 — the pair nets out of the balance.
        expect(afterReverse.reconciliation.balanceCents).toBe(startingBalance);

        // R7 — neither row offers Reverse any more.
        expect(originalRow.offersReverse, "a reversed charge must offer no further correction").toBe(false);
        expect(reversalRow.offersReverse, "a correction is never itself reversed").toBe(false);

        // ── E · R8 — and the domain refuses it even if something asks anyway ─────────────────────
        const again = await execute({
            action_key: "charge.reverse",
            entity_type: "child",
            entity_id: CHILD,
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: chargeId, charge_label: "certification fee", kind: "reversal" },
        });
        expect(again.json.ok, "a second reversal must be refused").toBeFalsy();
        expect(JSON.stringify(again.json)).toMatch(/already been reversed/);

        // The refusal changed nothing.
        const afterRefusal = await readCard();
        expect(afterRefusal.reconciliation.balanceCents).toBe(startingBalance);
        expect(afterRefusal.rows.filter((r) => r.correctsChargeId === chargeId)).toHaveLength(1);
    });
});
