/**
 * Layout V2 — foundation tests.
 *
 * Verifies the migration utility produces valid, deterministic documents for
 * every registry entity type on both surfaces, that the resolver falls back to
 * the registry, and that the validator enforces the non-negotiable constraints
 * (fixed depth, no nested groups, closed enums).
 */

import { describe, expect, it } from "vitest";
import {
    ALL_ENTITY_PRESENTATION_TYPES,
    drawerLayoutFromRegistry,
    layoutDocFromRegistry,
    queueLayoutFromRegistry,
} from "@/lib/layout/migrateFromRegistry";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { LAYOUT_DOC_FORMAT_VERSION } from "@/lib/layout/layoutV2";

describe("migrateFromRegistry → parseLayoutDoc", () => {
    it("produces a valid drawer + queue doc for every registry entity type", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            for (const surface of ["drawer", "queue"] as const) {
                const doc = layoutDocFromRegistry(entityType, surface);
                const res = parseLayoutDoc(doc);
                expect(res.errors, `${entityType}/${surface} errors: ${res.errors.join("; ")}`).toEqual([]);
                expect(res.ok, `${entityType}/${surface} should be valid`).toBe(true);
                expect(doc.formatVersion).toBe(LAYOUT_DOC_FORMAT_VERSION);
                expect(doc.surface).toBe(surface);
                expect(doc.entityType).toBe(entityType);
            }
        }
    });

    it("is deterministic: converting twice yields identical JSON", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            const a = JSON.stringify(drawerLayoutFromRegistry(entityType));
            const b = JSON.stringify(drawerLayoutFromRegistry(entityType));
            expect(a).toBe(b);
        }
    });

    it("generates unique item/section/row/column ids within a doc", () => {
        for (const entityType of ALL_ENTITY_PRESENTATION_TYPES) {
            const doc = drawerLayoutFromRegistry(entityType);
            const ids: string[] = [];
            for (const s of doc.sections) {
                ids.push(s.id);
                for (const r of s.rows) {
                    ids.push(r.id);
                    for (const c of r.columns) {
                        ids.push(c.id);
                        for (const it of c.items) {
                            ids.push(it.id);
                            for (const child of it.items ?? []) ids.push(child.id);
                        }
                    }
                }
            }
            expect(new Set(ids).size, `${entityType} has duplicate ids`).toBe(ids.length);
        }
    });

    it("queue docs are a single section of ordered column items", () => {
        const doc = queueLayoutFromRegistry("customers");
        expect(doc.sections).toHaveLength(1);
        expect(doc.sections[0].rows).toHaveLength(1);
        expect(doc.sections[0].rows[0].columns).toHaveLength(1);
        expect(doc.sections[0].rows[0].columns[0].items.length).toBeGreaterThan(0);
    });
});

describe("resolveLayout fallback chain", () => {
    it("falls back to the registry when no records are supplied", () => {
        const r = resolveLayout({ entityType: "customers", surface: "drawer" });
        expect(r.source).toBe("registry");
        expect(r.doc.entityType).toBe("customers");
    });

    it("prefers a published org record over a default record", () => {
        const base = layoutDocFromRegistry("customers", "drawer");
        const mk = (orgId: string | null, status: "draft" | "published", version: number) => ({
            id: `${orgId ?? "def"}-${version}`,
            orgId,
            industryKey: null,
            entityType: "customers",
            surface: "drawer" as const,
            layoutKey: "default",
            name: "n",
            version,
            status,
            isSystemDefault: orgId === null,
            doc: base,
            metadata: null,
            createdBy: null,
            createdAt: "2026-01-01",
            updatedAt: null,
            publishedAt: null,
        });
        const r = resolveLayout({
            entityType: "customers",
            surface: "drawer",
            orgRecords: [mk("org1", "published", 2), mk("org1", "draft", 3)],
            defaultRecords: [mk(null, "published", 5)],
        });
        expect(r.source).toBe("org");
        expect(r.record?.version).toBe(2); // highest *published* org version, not the draft v3
    });

    it("uses a default record when the org has only drafts", () => {
        const base = layoutDocFromRegistry("jobs", "queue");
        const rec = (orgId: string | null, status: "draft" | "published") => ({
            id: `${orgId ?? "def"}-${status}`,
            orgId,
            industryKey: null,
            entityType: "jobs",
            surface: "queue" as const,
            layoutKey: "default",
            name: "n",
            version: 1,
            status,
            isSystemDefault: orgId === null,
            doc: base,
            metadata: null,
            createdBy: null,
            createdAt: "2026-01-01",
            updatedAt: null,
            publishedAt: null,
        });
        const r = resolveLayout({
            entityType: "jobs",
            surface: "queue",
            orgRecords: [rec("org1", "draft")],
            defaultRecords: [rec(null, "published")],
        });
        expect(r.source).toBe("default");
    });
});

describe("validator enforces constraints", () => {
    const baseDoc = (sections: unknown[]) => ({
        formatVersion: 1,
        surface: "drawer",
        entityType: "customers",
        sections,
    });

    it("rejects an invalid surface", () => {
        const res = parseLayoutDoc({ ...baseDoc([]), surface: "workspace" });
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/surface/);
    });

    it("rejects an invalid item kind", () => {
        const res = parseLayoutDoc(
            baseDoc([
                {
                    id: "s1",
                    key: "k",
                    title: "T",
                    rows: [{ id: "r1", columns: [{ id: "c1", width: 12, items: [{ id: "i1", kind: "iframe", refKey: "x" }] }] }],
                },
            ]),
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/invalid item kind/);
    });

    it("rejects a field_group nested inside a field_group (no arbitrary nesting)", () => {
        const res = parseLayoutDoc(
            baseDoc([
                {
                    id: "s1",
                    key: "k",
                    title: "T",
                    rows: [
                        {
                            id: "r1",
                            columns: [
                                {
                                    id: "c1",
                                    width: 12,
                                    items: [
                                        {
                                            id: "g1",
                                            kind: "field_group",
                                            refKey: "g",
                                            items: [{ id: "g2", kind: "field_group", refKey: "h", items: [] }],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ]),
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/nested field_group/);
    });

    it("rejects duplicate ids", () => {
        const res = parseLayoutDoc(
            baseDoc([
                { id: "dup", key: "k", title: "T", rows: [{ id: "dup", columns: [] }] },
            ]),
        );
        expect(res.ok).toBe(false);
        expect(res.errors.join(" ")).toMatch(/duplicate id/);
    });

    it("drops lifecycle/status/workflow/business-rule fields (presentation only)", () => {
        const res = parseLayoutDoc(
            baseDoc([
                {
                    id: "s1",
                    key: "k",
                    title: "T",
                    rows: [
                        {
                            id: "r1",
                            columns: [
                                {
                                    id: "c1",
                                    width: 12,
                                    items: [
                                        {
                                            id: "i1",
                                            kind: "field",
                                            refKey: "amount",
                                            // None of these may survive into the doc.
                                            required: true,
                                            status: "active",
                                            workflowId: "wf_1",
                                            onClick: "doThing()",
                                            permission: "admin",
                                            color: "#ff0000",
                                            className: "danger",
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ]),
        );
        expect(res.ok).toBe(true);
        const item = res.doc!.sections[0].rows[0].columns[0].items[0] as unknown as Record<string, unknown>;
        for (const banned of ["required", "status", "workflowId", "onClick", "permission", "color", "className"]) {
            expect(item[banned], `"${banned}" must not be accepted`).toBeUndefined();
        }
        expect(item.refKey).toBe("amount");
    });

    it("ignores arbitrary nesting injected on a column (fixed hierarchy)", () => {
        const res = parseLayoutDoc(
            baseDoc([
                {
                    id: "s1",
                    key: "k",
                    title: "T",
                    rows: [
                        {
                            id: "r1",
                            columns: [
                                {
                                    id: "c1",
                                    width: 12,
                                    items: [],
                                    // A column may not contain rows/columns — must be dropped.
                                    rows: [{ id: "evil", columns: [] }],
                                    columns: [{ id: "evil2", width: 1, items: [] }],
                                },
                            ],
                        },
                    ],
                },
            ]),
        );
        expect(res.ok).toBe(true);
        const col = res.doc!.sections[0].rows[0].columns[0] as unknown as Record<string, unknown>;
        expect(col.rows).toBeUndefined();
        expect(col.columns).toBeUndefined();
        expect(Array.isArray(col.items)).toBe(true);
    });

    it("warns (but accepts) when column widths exceed the 12-grid", () => {
        const res = parseLayoutDoc(
            baseDoc([
                {
                    id: "s1",
                    key: "k",
                    title: "T",
                    rows: [
                        {
                            id: "r1",
                            columns: [
                                { id: "c1", width: 8, items: [] },
                                { id: "c2", width: 8, items: [] },
                            ],
                        },
                    ],
                },
            ]),
        );
        expect(res.ok).toBe(true);
        expect(res.warnings.join(" ")).toMatch(/sum/);
    });
});
