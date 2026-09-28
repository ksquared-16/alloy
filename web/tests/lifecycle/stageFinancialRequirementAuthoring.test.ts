/**
 * A DIRECTOR CAN SAY "FAMILIES PAY THE ENROLLMENT FEE" WITHOUT TOUCHING AN ID OR A JSON BLOB.
 *
 * The requirement model could express a fee before this screen existed, which is not the same as an
 * administrator being able to author one. These guard the authoring surface's own decisions: that it
 * offers the CURRENT charge definition rather than every superseded version of it, that it says the
 * price without ever storing it, and that grain is the existing `scope` rather than a second
 * vocabulary for the same thing.
 */
import { describe, expect, it } from "vitest";

import {
    currentDefinitions,
    priceLabel,
    requirementIdForChargeTemplate,
    rowsFromStage,
} from "@/components/adminV2/settings/lifecycle/StageFinancialRequirementsEditor";
import { parseStageRequirementsV1, requirementsOfOtherKinds } from "@/lib/lifecycle/stageRequirementsV1";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const DEF = {
    template_key: "registration_fee",
    label: "Registration fee",
    charge_category: "fee",
    amount_cents: 7500,
    amount_strategy: "fixed",
    currency_code: "USD",
    effective_start: "2026-01-01",
    is_active: true,
};

function stage(requirements: unknown[]): LifecycleBuilderStageRecord {
    return {
        requirements_v1: parseStageRequirementsV1({ version: 1, requirements }),
    } as unknown as LifecycleBuilderStageRecord;
}

describe("authoring a fee requirement", () => {
    it("reads an authored family fee back as the family grain", () => {
        const rows = rowsFromStage(
            stage([
                {
                    requirement_id: "fee_registration_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                    scope: "record",
                },
            ]),
        );
        expect(rows).toEqual([
            {
                requirement_id: "fee_registration_fee",
                kind: "financial",
                charge_template_key: "registration_fee",
                level: "required",
                scope: "record",
                timing: "stage_exit",
                enforcement: "blocking",
            },
        ]);
    });

    it("reads an authored per-child fee back as the per-child grain", () => {
        const rows = rowsFromStage(
            stage([
                {
                    requirement_id: "fee_registration_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                    scope: "each_child",
                },
            ]),
        );
        expect(rows[0].scope).toBe("each_child");
    });

    /*
     * Absent scope means "the evaluator's default", and for money the safe default is the one that
     * bills LESS: one obligation for the family, not one per child. A screen that guessed per-child
     * would silently double a two-child family's fee.
     */
    it("treats anything that is not the per-child grain as the family grain", () => {
        const rows = rowsFromStage(
            stage([
                {
                    requirement_id: "fee_registration_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                },
            ]),
        );
        expect(rows[0].scope).toBe("record");
    });

    it("reads nothing from a stage with no fee, and ignores other kinds", () => {
        expect(rowsFromStage(stage([]))).toEqual([]);
        expect(rowsFromStage(undefined)).toEqual([]);
        expect(
            rowsFromStage(
                stage([{ requirement_id: "w1", kind: "work", work_template_key: "tour", level: "required" }]),
            ),
        ).toEqual([]);
    });

    it("carries the kinds it does not edit, so saving a fee cannot erase the paperwork", () => {
        const section = parseStageRequirementsV1({
            version: 1,
            requirements: [
                { requirement_id: "f1", kind: "form", form_definition_id: "form-a", level: "required" },
                {
                    requirement_id: "fee_registration_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                },
            ],
        });
        const carried = requirementsOfOtherKinds(section, "financial");
        expect(carried).toHaveLength(1);
        expect(carried[0]).toMatchObject({ kind: "form", form_definition_id: "form-a" });
    });

    it("gives a fee an identity derived from its definition, so a reload is the same fee", () => {
        expect(requirementIdForChargeTemplate("registration_fee")).toBe("fee_registration_fee");
        expect(requirementIdForChargeTemplate("registration_fee")).toBe(
            requirementIdForChargeTemplate("registration_fee"),
        );
    });

    it("stores no amount, whatever the definition costs", () => {
        const rows = rowsFromStage(
            stage([
                {
                    requirement_id: "fee_registration_fee",
                    kind: "financial",
                    charge_template_key: "registration_fee",
                    level: "required",
                    scope: "record",
                },
            ]),
        );
        // The editor sends exactly these keys. `amount_cents` is not among them and cannot become
        // one without this failing.
        expect(Object.keys(rows[0]).sort()).toEqual([
            "charge_template_key",
            "enforcement",
            "kind",
            "level",
            "requirement_id",
            "scope",
            "timing",
        ]);
        expect(JSON.stringify(rows)).not.toContain("amount");
        expect(JSON.stringify(rows)).not.toContain("7500");
    });
});

describe("choosing a charge definition", () => {
    it("offers the current version of a lineage, not every superseded one", () => {
        const offered = currentDefinitions([
            { ...DEF, effective_start: "2026-01-01", amount_cents: 5000 },
            { ...DEF, effective_start: "2026-09-01", amount_cents: 7500 },
        ]);
        expect(offered).toHaveLength(1);
        expect(offered[0].amount_cents).toBe(7500);
    });

    it("does not offer a retired definition", () => {
        expect(currentDefinitions([{ ...DEF, is_active: false }])).toEqual([]);
    });

    it("offers each distinct definition once, by name", () => {
        const offered = currentDefinitions([
            { ...DEF, template_key: "supply_fee", label: "Supply fee" },
            DEF,
        ]);
        expect(offered.map((d) => d.template_key)).toEqual(["registration_fee", "supply_fee"]);
    });
});

describe("what the price line says", () => {
    it("shows the definition's amount", () => {
        expect(priceLabel(DEF)).toBe("$75.00");
    });

    /*
     * A $0 fee is a real configuration, not a missing one, and it must not read as an error. It is
     * also not the same as no fee: the requirement still exists and is still satisfied by canonical
     * Financials rather than by assumption.
     */
    it("says a zero fee costs nothing rather than looking broken", () => {
        expect(priceLabel({ ...DEF, amount_cents: 0 })).toBe("$0.00 — no charge");
    });

    it("does not invent a number when the definition computes one", () => {
        const label = priceLabel({ ...DEF, amount_strategy: "rate_table", amount_cents: null });
        expect(label).toBe("amount set by Financials");
        expect(label).not.toContain("$");
    });

    it("says nothing about a definition it cannot see", () => {
        expect(priceLabel(undefined)).toBe("");
    });
});
