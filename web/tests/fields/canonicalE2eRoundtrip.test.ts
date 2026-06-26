/**
 * Phase 7 — canonical E2E roundtrip validators (no DB required).
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
    simulateChildProfileReadAfterPatch,
    validateCreateLeadOcmInsertRow,
    validateCustomerMemberRowGrain,
    validateLayoutAliasMigration,
    validateOcmRowGrain,
    validateOpportunityWritePayload,
    validateRuntimeStatusDisplayInput,
} from "@/lib/fields/canonicalE2eValidators";
import { evaluateFieldRulesForStage } from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import { resolveOpportunityStatusDisplay } from "@/lib/admin/drawer/opportunityStatusDisplayResolve";
import { assertNoChildProfileKeysOnOcmPatch } from "@/lib/fields/canonicalStrictMode";
import { normalizeOpportunityWritePayload } from "@/lib/opportunityIdentity";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

describe("Phase 7 — lead create canonical persistence (pure)", () => {
    it("opportunity insert payload rejects legacy status", () => {
        expect(validateOpportunityWritePayload({ status: "open", status_key: "new_inquiry" })).toHaveLength(1);
        expect(validateOpportunityWritePayload({ status_key: "new_inquiry" })).toHaveLength(0);
    });

    it("create lead OCM row uses outcome_status_key only", () => {
        const row = validateCreateLeadOcmInsertRow({
            org_id: "org-1",
            opportunity_id: "opp-1",
            customer_member_id: "cm-1",
            outcome_status_key: "new_inquiry",
            metadata: { source: "create_lead" },
        });
        expect(row).toHaveLength(0);
    });

    it("normalizeOpportunityWritePayload strips legacy status on all paths", async () => {
        const supabase = { from: vi.fn() } as unknown as SupabaseClient;
        const patch: Record<string, unknown> = { status: "open", status_key: "new_inquiry", metadata: {} };
        await normalizeOpportunityWritePayload(supabase, patch, "test:strip");
        expect(patch.status).toBeUndefined();
        expect(patch.status_key).toBe("new_inquiry");
    });
});

describe("Phase 7 — child profile write/read roundtrip", () => {
    it("profile values resolve from customer_member snapshot", () => {
        const read = simulateChildProfileReadAfterPatch({
            before: { first_name: "Ava", last_name: "Lee", dob: "2020-01-15" },
            patch: { gender: "female", allergies: "peanut", medical_notes: "asthma" },
        });
        expect(read.first_name).toBe("Ava");
        expect(read.gender).toBe("female");
        expect(read.allergies).toBe("peanut");
        expect(read.medical_notes).toBe("asthma");
    });

    it("lifecycle readiness reads profile from inquiry_children snapshot", () => {
        const violations = evaluateFieldRulesForStage(
            {
                phase: "action",
                entity_type: "opportunity",
                entity_id: "opp-1",
                values: {},
                related: {
                    inquiry_children: [
                        {
                            id: "ocm-1",
                            customer_member_id: "cm-1",
                            first_name: "Ava",
                            last_name: "Lee",
                        },
                    ],
                },
            },
            "lead",
            { required_rule_ids: ["child:first_name"], recommended_rule_ids: [] }
        );
        expect(violations).toHaveLength(0);
    });

    it("customer_member row rejects enrollment columns", () => {
        expect(validateCustomerMemberRowGrain({ first_name: "Ava", location_id: "loc-1" })).toHaveLength(1);
        expect(validateCustomerMemberRowGrain({ first_name: "Ava", dob: "2020-01-01" })).toHaveLength(0);
    });
});

describe("Phase 7 — OCM enrollment write/read", () => {
    it("OCM row rejects profile columns", () => {
        expect(validateOcmRowGrain({ first_name: "Ava", outcome_status_key: "waitlisted" })).toHaveLength(1);
        expect(
            validateOcmRowGrain({
                desired_start_date: "2026-09-01",
                outcome_status_key: "waitlisted",
                location_id: "loc-1",
            })
        ).toHaveLength(0);
    });

    it("OCM PATCH rejects profile keys at API guard", () => {
        expect(assertNoChildProfileKeysOnOcmPatch({ first_name: "Hack" })).toBeTruthy();
        expect(assertNoChildProfileKeysOnOcmPatch({ desired_start_date: "2026-09-01" })).toBeNull();
    });
});

describe("Phase 7 — status transition display", () => {
    it("resolveOpportunityStatusDisplay uses status_key + definitions only", () => {
        const label = resolveOpportunityStatusDisplay({
            statusKey: "new_inquiry",
            statusDefs: [{ status_key: "new_inquiry", status_label: "New Inquiry" }],
        });
        expect(label).toBe("New Inquiry");
    });

    it("runtime status input must not depend on legacy status column", () => {
        expect(validateRuntimeStatusDisplayInput({ status_key: "new_inquiry" })).toHaveLength(0);
        expect(validateRuntimeStatusDisplayInput({ status: "open" })).toHaveLength(1);
    });
});

describe("Phase 7 — layout alias migration compatibility", () => {
    it("migrates deprecated refKeys in stored layout JSON", () => {
        const issues = validateLayoutAliasMigration({
            items: [{ refKey: "child_inquiry.desired_start_date" }],
        });
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.message).toContain("inquiry_child.desired_start_date");
    });
});

describe("Phase 7 — intake source contract", () => {
    function read(rel: string): string {
        const p = join(process.cwd(), rel);
        expect(existsSync(p), rel).toBe(true);
        return readFileSync(p, "utf8");
    }

    const INTAKE_WRITERS = [
        "lib/admin/actions/entryLifecycleActions.ts",
        "lib/forms/intake/applyFormLeadCaptureIntake.ts",
        "lib/forms/intake/applyFormIntakeSafe.ts",
        "app/api/book-v2/quote-start/route.ts",
        "app/api/book-v2/specialty-quote-start/route.ts",
        "app/api/book-v2/confirm/route.ts",
    ];

    for (const rel of INTAKE_WRITERS) {
        it(`${rel} does not embed status: "open" on opportunity payloads`, () => {
            const src = read(rel);
            expect(src).not.toMatch(/status:\s*["']open["']/);
        });
    }

    it("normalizeOpportunityWritePayload strips legacy status centrally", () => {
        const src = read("lib/opportunityIdentity.ts");
        expect(src).toContain("stripLegacyTextStatusFromWritePayload");
    });
});
