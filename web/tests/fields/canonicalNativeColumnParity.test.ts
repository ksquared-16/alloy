import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    buildCanonicalParityExpectedRows,
    buildParityDryRunReport,
    buildParityInsertPayload,
    findDuplicateFieldDefinitionKeys,
    findMissingParityRows,
    parityRowKey,
    planParityApply,
    validateParityRowOwnership,
} from "@/lib/fields/canonicalNativeColumnParity";

describe("canonicalNativeColumnParity", () => {
    it("builds deterministic expected rows sorted by entity and field_key", () => {
        const rows = buildCanonicalParityExpectedRows();
        expect(rows.length).toBeGreaterThan(0);
        const keys = rows.map((r) => parityRowKey(r.entity_type, r.field_key));
        expect(keys).toEqual([...keys].sort());
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("detects missing canonical field definitions", () => {
        const expected = buildCanonicalParityExpectedRows();
        const sample = expected[0]!;
        const existing = expected.slice(1).map((r) => ({ entity_type: r.entity_type, field_key: r.field_key }));
        const missing = findMissingParityRows(expected, existing);
        expect(missing.some((m) => m.field_key === sample.field_key && m.entity_type === sample.entity_type)).toBe(
            true
        );
    });

    it("detects duplicate entity_type + field_key rows", () => {
        const dupes = findDuplicateFieldDefinitionKeys([
            { entity_type: "customer_member", field_key: "gender" },
            { entity_type: "customer_member", field_key: "gender" },
            { entity_type: "inquiry_child", field_key: "notes" },
        ]);
        expect(dupes).toEqual(["customer_member:gender"]);
    });

    it("rejects invalid ownership for profile fields on inquiry_child manifest rows", () => {
        const err = validateParityRowOwnership({
            entity_type: "inquiry_child",
            field_key: "gender",
            field_type: "select",
            label: "Gender",
            section_key: "x",
            sort_order: 1,
            source: "test",
            is_visible_in_drawer: true,
            is_visible_in_form: true,
            is_visible_in_table: false,
        });
        expect(err).toMatch(/customer_member/);
    });

    it("produces deterministic insert payloads", () => {
        const row = buildCanonicalParityExpectedRows().find((r) => r.entity_type === "customer_member")!;
        const orgId = "11111111-1111-4111-8111-111111111111";
        const a = buildParityInsertPayload(orgId, row);
        const b = buildParityInsertPayload(orgId, row);
        expect(a).toEqual(b);
        expect(a.org_id).toBe(orgId);
        expect(a.is_system).toBe(true);
    });

    it("dry-run report counts present vs missing", () => {
        const expected = buildCanonicalParityExpectedRows();
        const report = buildParityDryRunReport("org-1", expected.map((r) => ({ entity_type: r.entity_type, field_key: r.field_key })));
        expect(report.presentCount).toBe(expected.length);
        expect(report.missing).toHaveLength(0);
    });

    it("planParityApply is idempotent", () => {
        const expected = buildCanonicalParityExpectedRows();
        const full = expected.map((r) => ({ entity_type: r.entity_type, field_key: r.field_key }));
        const plan = planParityApply("org-1", full);
        expect(plan.toInsert).toHaveLength(0);
        expect(plan.skipped.length).toBe(expected.length);
    });
});

describe("canonical legacy status read contract — runtime loaders", () => {
    function read(rel: string): string {
        const p = join(process.cwd(), rel);
        expect(existsSync(p), `exists: ${rel}`).toBe(true);
        return readFileSync(p, "utf8");
    }

    const RUNTIME_SOURCES = [
        "lib/admin/operationalTasksWorkspaceEnrichment.ts",
        "lib/communications/v2/commandCenterConversationEnrichment.ts",
        "lib/communications/inboxThreadsService.ts",
        "lib/agent/taskAssist/taskAssistOpportunityContext.ts",
        "lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData.ts",
        "app/api/admin/opportunities/[id]/activity-signal/route.ts",
        "app/api/admin/customers/route.ts",
    ];

    for (const rel of RUNTIME_SOURCES) {
        it(`${rel} does not SELECT legacy opportunities.status or customers.status`, () => {
            const src = read(rel);
            if (rel.includes("opportunities")) {
                expect(src).not.toMatch(/opportunities[\s\S]*select\("[^"]*\bstatus,/i);
            }
            if (rel.includes("customers/route")) {
                expect(src).not.toMatch(/name, status, status_key/);
            }
            if (rel.includes("loadFamilyWorkspaceData")) {
                expect(src).not.toMatch(/customers"\)\.select\("[^"]*\bstatus,/);
            }
        });
    }

    it("resolveOpportunityStatusDisplay does not accept legacyStatus param", () => {
        const src = read("lib/admin/drawer/opportunityStatusDisplayResolve.ts");
        expect(src).not.toMatch(/legacyStatus/);
    });

    it("runtime canonicalStatusRead uses status_key only", () => {
        const src = read("lib/fields/canonicalStatusRead.ts");
        expect(src).toMatch(/Runtime default — status_key only/);
        expect(src).not.toMatch(/LegacyFallback/);
    });
});
