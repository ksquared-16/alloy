/**
 * THE MANIFEST MUST COVER THE CONSUMER THAT WAS MISSED.
 *
 * S1 and S2 were certified against `tests/financials/**` plus access guards, and neither reached
 * `tests/operationalConsumption`, which consumes the same charge and reduction authorities. That
 * omission cost 63 failing tests on the deployed commit, including a NOT NULL violation that broke
 * every reduction written through `reductionCore`.
 *
 * A manifest nothing asserts is a manifest that can quietly shrink back. This is the assertion.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MANIFEST = "test:financials-economic-writers";
const scripts = () =>
    (JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as
        { scripts: Record<string, string> }).scripts;

describe("the Financials economic-writer regression manifest", () => {
    it("exists, and runs vitest rather than a bespoke orchestrator", () => {
        const cmd = scripts()[MANIFEST];
        expect(cmd, `${MANIFEST} must exist`).toBeTruthy();
        expect(cmd, "extends the repository's test:<domain> convention").toMatch(/^vitest run /);
    });

    it("covers operationalConsumption — the consumer S1/S2 missed", () => {
        const cmd = scripts()[MANIFEST] ?? "";
        expect(cmd, "the whole reason this manifest exists").toContain("tests/operationalConsumption/");
        /* Not one token paying lip service: the generation, correction and obligation paths. */
        for (const consumer of [
            "consumptionService",
            "attendanceConsumptionService",
            "scheduleConsumptionService",
            "correctionConsumption",
            "obligationReviewService",
        ]) {
            expect(cmd, `must cover ${consumer}`).toContain(consumer);
        }
    });

    it("covers every domain the shared authorities touch", () => {
        const cmd = scripts()[MANIFEST] ?? "";
        for (const [label, needle] of [
            ["charge lifecycle", "chargeLifecycleService"],
            ["childcare charge service", "childcareChargeService"],
            ["charge actions", "financialChargeActions"],
            ["tuition generation", "tests/financials/tuitionGeneration"],
            ["generated auto-post", "generatedBillingAutoPost"],
            ["reductions", "tests/financials/reductions"],
            ["billing-period binding", "billingPeriodGenerations"],
            ["payments compatibility", "tests/financials/payments"],
        ] as const) {
            expect(cmd, `must cover ${label}`).toContain(needle);
        }
    });

    it("records why anything is excluded, so an exclusion cannot be silent", () => {
        const doc = readFileSync(
            resolve(__dirname, "../../../docs/platform/governance/financials-economic-writer-regression.md"),
            "utf8",
        );
        expect(doc).toContain("PRE_EXISTING_AUTHORIZATION_RED");
        expect(doc, "the live suites' exclusion is stated, not assumed").toContain("LIVE_FIXTURE_STATE");
    });
});
