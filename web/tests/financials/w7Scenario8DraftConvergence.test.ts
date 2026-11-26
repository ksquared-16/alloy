/**
 * W7 SCENARIO 8 — A DRAFT CHARGE IS THE SAME OBJECT THE OPERATOR CREATED IN ADD CHARGE.
 *
 *   W7-F014  Charge Details: human title, Add Charge's grouping, one stable shell
 *   W7-F016  Draft lifecycle: Edit and Cancel draft for drafts only; posted money is corrected
 *   W7-F017  A charge type that overrides the organisation's invoice timing says so
 *   W7-F018  Drafts are "Upcoming · not yet posted" — never balance, Due or Past due
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { cancelDraftCharge, CancelDraftChargeError } from "@/lib/financials/chargeLifecycle/cancelDraftCharge";
import { upcomingFor, pastDueFor, notYetDueFor } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { financialChargeActions, CHARGE_CANCEL_DRAFT_ACTION_KEY } from "@/lib/adminV2/actions/definitions/financialChargeActions";
import { FINANCIAL_TRANSACTION_ACTIONS } from "@/lib/financials/commands/financialTransactionCommands";
import { invoiceRuleSource } from "@/lib/financials/chargeDates/describeChargeDateChain";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/* ── a tiny fake of the supabase query builder: records every write ─────────────────────────── */
function fakeDb(rows: Array<Record<string, unknown>>) {
    const writes: Array<{ op: string; values?: Record<string, unknown>; filters: Record<string, unknown> }> = [];
    const from = () => {
        const filters: Record<string, unknown> = {};
        let op = "select";
        let values: Record<string, unknown> | undefined;
        const match = () => rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
        const builder: Record<string, unknown> = {
            select: () => builder,
            update: (v: Record<string, unknown>) => { op = "update"; values = v; return builder; },
            delete: () => { op = "delete"; return builder; },
            eq: (k: string, v: unknown) => { filters[k] = v; return builder; },
            maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
            then: (resolve: (x: unknown) => void) => {
                const hit = match();
                if (op === "update") {
                    writes.push({ op, values, filters: { ...filters } });
                    for (const r of hit) Object.assign(r, values);
                } else if (op === "delete") writes.push({ op, filters: { ...filters } });
                resolve({ data: hit.map((r) => ({ ...r })), error: null });
            },
        };
        return builder;
    };
    return { db: { from } as never, writes, rows };
}

describe("W7-F016 — cancelling a draft is retained, attributed, and never a delete", () => {
    it("a draft becomes void with who, when and why — and nothing is deleted", async () => {
        const { db, writes, rows } = fakeDb([
            { id: "c1", org_id: "o", status: "draft", metadata: { charge_dates: { version: 1 } } },
        ]);
        const out = await cancelDraftCharge(db, { orgId: "o", chargeId: "c1", actorUserId: "u1", reason: "operator_cancelled", now: new Date("2026-10-14T12:00:00Z") });
        expect(out).toMatchObject({ status: "void", alreadyCancelled: false });
        expect(rows[0]!.status).toBe("void");
        expect((rows[0]!.metadata as Record<string, unknown>).charge_dates, "provenance is kept").toEqual({ version: 1 });
        expect((rows[0]!.metadata as { retirement: Record<string, unknown> }).retirement).toMatchObject({ reason: "operator_cancelled", actor_user_id: "u1" });
        expect(writes.some((w) => w.op === "delete")).toBe(false);
        expect(writes[0]!.filters.status, "conditional on still being a draft").toBe("draft");
    });

    it("a posted charge is refused and pointed at the correction path", async () => {
        const { db, writes } = fakeDb([{ id: "c1", org_id: "o", status: "posted", metadata: {} }]);
        await expect(cancelDraftCharge(db, { orgId: "o", chargeId: "c1", actorUserId: "u1", reason: "operator_cancelled" }))
            .rejects.toMatchObject({ code: "charge_not_draft" });
        expect(writes).toHaveLength(0);
        expect(new CancelDraftChargeError("charge_not_draft", "x")).toBeInstanceOf(Error);
    });

    it("a draft discount written beside it is withdrawn with it, keeping its own metadata", async () => {
        const { db, rows } = fakeDb([
            { id: "c1", org_id: "o", status: "draft", metadata: {} },
            { id: "r1", org_id: "o", status: "draft", source_charge_id: "c1", metadata: { reduction: { policy: "sib" } } },
        ]);
        const out = await cancelDraftCharge(db, { orgId: "o", chargeId: "c1", actorUserId: "u1", reason: "operator_cancelled" });
        expect(out.withdrawnReductions).toBe(1);
        expect(rows[1]!.status).toBe("void");
        expect((rows[1]!.metadata as Record<string, unknown>).reduction).toEqual({ policy: "sib" });
    });

    it("an edit records which charge replaced the draft", async () => {
        const { db, rows } = fakeDb([{ id: "c1", org_id: "o", status: "draft", metadata: {} }]);
        await cancelDraftCharge(db, { orgId: "o", chargeId: "c1", actorUserId: "u1", reason: "replaced_by_edit", replacedByChargeId: "c2" });
        expect((rows[0]!.metadata as { retirement: Record<string, unknown> }).retirement).toMatchObject({ reason: "replaced_by_edit", replaced_by_charge_id: "c2" });
    });

    it("is a registered, governed action and a canonical row command", () => {
        expect(financialChargeActions.map((a) => a.actionKey)).toContain(CHARGE_CANCEL_DRAFT_ACTION_KEY);
        expect(FINANCIAL_TRANSACTION_ACTIONS.cancelDraft).toBe("charge.cancel_draft");
        expect(read("lib/platform/commands/capabilityRegistry.ts")).toMatch(/registeredActionKey: "charge\.cancel_draft"/);
    });
});

describe("W7-F016 — the record offers the lifecycle its status allows", () => {
    const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
    const actions = card.slice(card.indexOf('data-financials-charge-detail-for={surface.chargeId}'), card.indexOf('data-financials-charge-detail-close="true"'));

    it("a draft offers Edit draft and Cancel draft (with a confirm step)", () => {
        expect(actions).toMatch(/chargeDetailFacts\.status === "draft" \? \(/);
        expect(actions).toContain('data-financials-charge-detail-edit-draft="true"');
        expect(actions).toContain('data-financials-charge-detail-cancel-draft="true"');
        expect(actions).toContain('data-financials-charge-detail-cancel-draft-confirm="true"');
    });

    it("a posted charge offers only the correction path — no edit, no delete", () => {
        expect(actions).toMatch(/chargeDetailFacts\?\.status !== "draft" && adjustableCharges\.some/);
        expect(card).not.toMatch(/charge\.delete|delete_charge/);
    });

    it("Edit replaces the draft only after the new one is written, and only when it is a different charge", () => {
        expect(card).toMatch(/if \(replacingDraftId && createdChargeIds\[0\] && createdChargeIds\[0\] !== replacingDraftId\)/);
        expect(card).toMatch(/replaced_by_charge_id: createdChargeIds\[0\]/);
    });

    it("Add Charge, opened to edit, says so", () => {
        const add = read("components/operationalCards/AddChargeCommand.tsx");
        expect(add).toMatch(/title=\{editing \? "Edit draft" : "Add"\}/);
        expect(add).toContain('"Save changes"');
    });
});

describe("W7-F014 — title, header and one stable shell", () => {
    it("opens with the charge type's human name, never a category key", () => {
        const detail = read("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).toMatch(/const label = \(e\.label && !\/\^\[a-z0-9\]\+\(\?:_\[a-z0-9\]\+\)\+\$\/\.test\(e\.label\)/);
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        const block = card.slice(card.indexOf('if (overlay === "charge_detail" && surface?.kind === "charge_detail")'));
        /* The overlay's own card is the titled one — read up to where that card closes. */
        expect(block.slice(0, block.indexOf("</UniversalCard>"))).toMatch(/title="Charge details"/);
    });

    /* W7-F027: the header states the operator state through the one shared rule, not "Draft charge". */
    it("states the charge's operator state in the header", () => {
        const src = read("app/adminV2/financials/FinancialsChargeDetail.tsx");
        expect(src).toMatch(/const headerState = financialsChargeState\(\{ status: detail\.status, awaitingKey: detail\.awaiting\?\.key \?\? null \}\);/);
        expect(src).toMatch(/<FinancialsChargeState state=\{headerState\.key\} label=\{headerState\.label\} \/>/);
        expect(src).not.toContain('"Draft charge"');
    });

    it("loads inside the same shell, and a refresh never remounts or swaps the card", () => {
        const src = read("app/adminV2/financials/FinancialsChargeDetail.tsx");
        expect(src).not.toContain("Loading charge…");
        expect(src).toMatch(/aria-busy="true"/);
        expect(src).toMatch(/\}, \[chargeId, refreshKey\]\);/);
        /*
         * W7-F021: Charges no longer draws a second detail — it opens the account's own card ON the
         * charge, so the certified Charge Details (and its refresh-without-remount) is the one used.
         */
        const charges = read("app/adminV2/financials/sections/FinancialsCharges.tsx");
        expect(charges).not.toContain("<FinancialsChargeDetail");
        expect(charges).toMatch(/<FinancialsAccountDetail[\s\S]*?openCharge=\{\{ chargeId: open\.chargeId, label: open\.label, seed: open\.seed \}\}/);
    });
});

describe("W7-F017 — a charge-type timing override is named where it acts", () => {
    it("the preview calls it a charge-type override", () => {
        expect(invoiceRuleSource({ strategy: "days_after_service_date", offsetDays: 7, source: { kind: "template" } } as never)).toBe("charge-type override");
    });

    it("Add Charge and Charge Details both keep it — as an info mark, not prose (Scenario 8 final)", () => {
        expect(read("components/operationalCards/AddChargeCommand.tsx")).toContain("`Charge-type override · ${specimen.invoiceOverride}`");
        expect(read("app/adminV2/financials/FinancialsChargeDetail.tsx")).toContain('detail.invoiceRule?.source === "template"');
        expect(read("lib/financials/workspace/resolveChargeDetail.ts")).toMatch(/invoice_rule_source/);
    });
});

describe("W7-F018 — drafts are upcoming, never balance, Due or Past due", () => {
    const row = (over: Record<string, unknown>) =>
        ({ chargeId: "c", amountCents: 1800, status: "draft", lifecycleStatus: "scheduled", correctionKind: null, dueDate: "2026-11-12", ...over }) as never;

    it("an $18 future-period draft is $18 upcoming", () => {
        expect(upcomingFor([row({})])).toEqual({ amountCents: 1800, count: 1 });
    });

    it("and is never past due, nor 'not yet due' (that is for posted money)", () => {
        expect(pastDueFor([row({ dueDate: "2026-10-01" })], "2026-10-14")).toBeNull();
        expect(notYetDueFor([row({})], "2026-10-14")).toBeNull();
    });

    it("posted and cancelled rows are not upcoming", () => {
        expect(upcomingFor([row({ status: "posted", lifecycleStatus: "posted" }), row({ status: "void", lifecycleStatus: "void" })])).toBeNull();
    });

    it("the summary states Scheduled beside the balance, and the ledger sets draft rows apart", () => {
        expect(read("components/operationalCards/FinancialsDetailCard.tsx")).toMatch(/label="Scheduled"\s*value=\{summary\.scheduled\}/);
        expect(read("components/operationalCards/FinancialsDetailCard.tsx")).toMatch(/tone: "upcoming" as const/);
        expect(read("app/adminV2/components/operationalCardsShared.css")).toContain(".alloy-os-billingdetail__row--upcoming");
    });
});

describe("W7-F016 — an edit leaves the account view as it found it", () => {
    const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
    it("the child filter is saved when Edit draft scopes the form, and restored on save and on dismissal", () => {
        expect(card).toMatch(/setFilterBeforeEdit\(subjectFilter\);\s*setReplacingDraftId\(facts\.chargeId\);/);
        expect(card.match(/if \(replacingDraftId && filterBeforeEdit !== null\) setSubjectFilter\(filterBeforeEdit\);/g)?.length).toBe(2);
    });
});
