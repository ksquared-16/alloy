/**
 * Layout runtime parity — Phase 0 golden tests.
 *
 * Ensures registry fallback remains byte-identical for all entity types when
 * no published layouts or queue context are supplied.
 */

import { describe, expect, it } from "vitest";
import { ALL_ENTITY_PRESENTATION_TYPES, layoutDocFromRegistry } from "@/lib/layout/migrateFromRegistry";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { buildLayoutRuntimePlan, layoutDocSupportsAllSprint1ItemKinds } from "@/lib/layout/runtime";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";

describe("runtimeParity — registry fallback unchanged", () => {
    it("drawer: resolveLayout matches layoutDocFromRegistry for every entity type", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            const fromRegistry = layoutDocFromRegistry(entityType, "drawer");
            const resolved = resolveLayout({ entityType, surface: "drawer" });
            expect(resolved.source).toBe("registry");
            expect(JSON.stringify(resolved.doc)).toBe(JSON.stringify(fromRegistry));
        }
    });

    it("queue: resolveLayout matches layoutDocFromRegistry when no queue context", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            const fromRegistry = layoutDocFromRegistry(entityType, "queue");
            const resolved = resolveLayout({ entityType, surface: "queue" });
            expect(resolved.source).toBe("registry");
            expect(JSON.stringify(resolved.doc)).toBe(JSON.stringify(fromRegistry));
        }
    });

    it("every registry drawer doc parses cleanly", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            const doc = layoutDocFromRegistry(entityType, "drawer");
            const res = parseLayoutDoc(doc);
            expect(res.ok, `${entityType}: ${res.errors.join("; ")}`).toBe(true);
        }
    });
});

describe("runtimeParity — render plan", () => {
    it("lead drawer default includes all Sprint 1 item kinds", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const plan = buildLayoutRuntimePlan(doc);
        expect(plan.itemKindCounts.field).toBeGreaterThan(0);
        expect(plan.itemKindCounts.field_group).toBeGreaterThan(0);
        expect(plan.itemKindCounts.related_list).toBeGreaterThan(0);
        expect(plan.itemKindCounts.widget_placeholder).toBeGreaterThan(0);
        expect(layoutDocSupportsAllSprint1ItemKinds(doc)).toBe(true);
    });

    it("org published record wins over registry for drawer", () => {
        const customDoc = buildLeadDrawerDefaultDoc();
        const orgRecord = {
            id: "org-layout-1",
            orgId: "org-1",
            industryKey: null,
            entityType: "opportunities",
            surface: "drawer" as const,
            layoutKey: "custom",
            name: "Custom",
            version: 2,
            status: "published" as const,
            isSystemDefault: false,
            doc: customDoc,
            metadata: null,
            createdBy: null,
            createdAt: new Date().toISOString(),
            updatedAt: null,
            publishedAt: new Date().toISOString(),
        };

        const r = resolveLayout({
            entityType: "opportunities",
            surface: "drawer",
            orgRecords: [orgRecord],
        });

        expect(r.source).toBe("org");
        expect(r.doc).toBe(customDoc);
    });
});
