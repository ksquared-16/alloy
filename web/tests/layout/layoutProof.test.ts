/**
 * Layout V2 proof — tests for value resolution and layout source selection.
 */

import { describe, expect, it } from "vitest";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { layoutDocFromRegistry } from "@/lib/layout/migrateFromRegistry";
import type { EntityLayoutRecord, LayoutItem } from "@/lib/layout/layoutV2";

const field = (refKey: string, renderHint?: LayoutItem["renderHint"]): LayoutItem => ({
    id: `i-${refKey}`,
    kind: "field",
    refKey,
    renderHint,
});

describe("resolveItemValue", () => {
    const rec = {
        name: "Donald Duck — Quote",
        status_key: "qualified",
        _status_display: "Qualified",
        quote_total: 265,
        recurring_price_cents: 18500,
        job_date: "2026-03-01",
        created_at: "2026-03-01T12:00:00Z",
        _customer_name: "Donald Duck",
        empty_field: null,
    };

    it("resolves a present text field", () => {
        const r = resolveItemValue(rec, field("name", "text"));
        expect(r.isPlaceholder).toBe(false);
        expect(r.display).toBe("Donald Duck — Quote");
    });

    it("marks a missing field as placeholder", () => {
        const r = resolveItemValue(rec, field("does_not_exist", "text"));
        expect(r.isPlaceholder).toBe(true);
        expect(r.display).toBeNull();
    });

    it("treats null values as placeholder", () => {
        const r = resolveItemValue(rec, field("empty_field", "text"));
        expect(r.isPlaceholder).toBe(true);
    });

    it("status prefers the hydrated _status_display label", () => {
        const r = resolveItemValue(rec, field("status_key", "status"));
        expect(r.isPlaceholder).toBe(false);
        expect(r.display).toBe("Qualified");
    });

    it("formats dollar money as-is and *_cents divided by 100", () => {
        const dollars = resolveItemValue(rec, field("quote_total", "money"));
        const cents = resolveItemValue(rec, field("recurring_price_cents", "money"));
        expect(dollars.display).toContain("265");
        expect(cents.display).toContain("185"); // 18500 cents → $185.00
        expect(cents.display).not.toContain("18,500");
    });

    it("formats a date field", () => {
        const r = resolveItemValue(rec, field("job_date", "date"));
        expect(r.isPlaceholder).toBe(false);
        expect(r.display).toMatch(/2026/);
    });

    it("resolves link items to the hydrated name value", () => {
        const r = resolveItemValue(rec, field("_customer_name", "link"));
        expect(r.display).toBe("Donald Duck");
    });
});

describe("opportunities layout source selection", () => {
    it("registry fallback yields a non-empty drawer doc for opportunities", () => {
        const r = resolveLayout({ entityType: "opportunities", surface: "drawer" });
        expect(r.source).toBe("registry");
        expect(r.doc.sections.length).toBeGreaterThan(0);
        // The Opportunity Details section's fields must be present.
        const allRefKeys = r.doc.sections
            .flatMap((s) => s.rows)
            .flatMap((row) => row.columns)
            .flatMap((c) => c.items)
            .map((i) => i.refKey);
        expect(allRefKeys).toContain("status_key");
        expect(allRefKeys).toContain("name");
    });

    it("registry fallback yields ordered queue columns for opportunities", () => {
        const r = resolveLayout({ entityType: "opportunities", surface: "queue" });
        expect(r.source).toBe("registry");
        const items = r.doc.sections[0].rows[0].columns[0].items;
        expect(items.length).toBeGreaterThan(0);
        expect(items.map((i) => i.refKey)).toContain("name");
    });

    it("prefers a published org opportunities layout over registry", () => {
        const base = layoutDocFromRegistry("opportunities", "queue");
        const orgRec: EntityLayoutRecord = {
            id: "org-1",
            orgId: "org-1",
            industryKey: null,
            entityType: "opportunities",
            surface: "queue",
            layoutKey: "default",
            name: "Custom",
            version: 1,
            status: "published",
            isSystemDefault: false,
            doc: base,
            metadata: null,
            createdBy: null,
            createdAt: "2026-01-01",
            updatedAt: null,
            publishedAt: "2026-01-02",
        };
        const r = resolveLayout({ entityType: "opportunities", surface: "queue", orgRecords: [orgRec] });
        expect(r.source).toBe("org");
        expect(r.record?.id).toBe("org-1");
    });
});
