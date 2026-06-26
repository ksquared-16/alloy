/**
 * Canonical Data System — enforcement index (Phase 5).
 *
 * Cross-cutting invariant checks and documentation pointers.
 * Detailed coverage lives in sibling test files — this file is the contract index.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCanonicalFieldCatalogRows } from "@/lib/fields/buildCanonicalFieldCatalog";
import { buildCanonicalParityExpectedRows, validateParityRowOwnership } from "@/lib/fields/canonicalNativeColumnParity";
import { LIFECYCLE_FIELD_RULE_BINDINGS } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { assertLifecycleBindingGrain, assertNoLegacyTextStatusPatch, assertNoChildProfileKeysOnOcmPatch } from "@/lib/fields/canonicalStrictMode";

const ENFORCEMENT_TEST_FILES = [
    "tests/fields/canonicalFieldOwnership.test.ts",
    "tests/fields/canonicalChildGrainMapping.test.ts",
    "tests/fields/canonicalReadAlignment.test.ts",
    "tests/fields/canonicalNativeColumnParity.test.ts",
    "tests/fields/canonicalLegacyStatusIsolation.test.ts",
    "tests/fields/canonicalPhase6SourceContract.test.ts",
    "tests/fields/canonicalE2eRoundtrip.test.ts",
    "tests/fields/canonicalEnforcement.test.ts",
] as const;

const DOCTRINE_DOCS = [
    "docs/canonical-data-system.md",
    "docs/canonical-entity-specification.md",
    "docs/canonical-status-architecture.md",
    "docs/canonical-field-catalog.md",
    "docs/canonical-action-status-field-matrix.md",
    "docs/canonical-runtime-data-alignment.md",
    "docs/canonical-configuration-data-alignment.md",
] as const;

describe("canonical enforcement index — Phase 5", () => {
    it("all enforcement test files exist", () => {
        for (const rel of ENFORCEMENT_TEST_FILES) {
            expect(existsSync(join(process.cwd(), rel)), rel).toBe(true);
        }
    });

    it("doctrine docs exist", () => {
        for (const rel of DOCTRINE_DOCS) {
            expect(existsSync(join(process.cwd(), "..", rel)), rel).toBe(true);
        }
    });

    it("parity manifest rows pass ownership validation", () => {
        const errors = buildCanonicalParityExpectedRows()
            .map((row) => validateParityRowOwnership(row))
            .filter(Boolean);
        expect(errors).toEqual([]);
    });

    it("generated field catalog has rows", () => {
        expect(buildCanonicalFieldCatalogRows().length).toBeGreaterThan(50);
    });

    it("lifecycle bindings pass grain assertions", () => {
        const errors: string[] = [];
        for (const binding of LIFECYCLE_FIELD_RULE_BINDINGS) {
            const err = assertLifecycleBindingGrain({
                rule_id: binding.rule_id,
                value_source: binding.value_source,
                field_key: binding.field_key,
                ocm_field: binding.ocm_field,
                customer_member_field: binding.customer_member_field,
            });
            if (err) errors.push(err);
        }
        expect(errors).toEqual([]);
    });

    it("blocks legacy text status PATCH", () => {
        expect(assertNoLegacyTextStatusPatch({ status: "open" })).toBeTruthy();
        expect(assertNoLegacyTextStatusPatch({ status_key: "open" })).toBeNull();
    });

    it("blocks child profile keys on OCM PATCH", () => {
        expect(assertNoChildProfileKeysOnOcmPatch({ first_name: "Ava" })).toBeTruthy();
        expect(assertNoChildProfileKeysOnOcmPatch({ desired_start_date: "2026-09-01" })).toBeNull();
    });

    it("canonical doctrine references enforcement tests", () => {
        const src = readFileSync(join(process.cwd(), "../docs/canonical-data-system.md"), "utf8");
        expect(src).toContain("canonicalEnforcement.test.ts");
        expect(src).toContain("tests/fields/canonical");
    });
});
