/**
 * Surface Layout Registry + validation — Visual Layout Configuration Builder Phase 1.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    buildSurfaceLayoutRegistryResponse,
    isSurfaceLayoutKey,
    OPPORTUNITY_DRAWER_SURFACE,
    resolveSurfaceLayoutKeyFromDoc,
} from "@/lib/layout/surfaceLayoutRegistry";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";

describe("surface layout registry", () => {
    it("returns opportunity, person, and child drawers as enabled", () => {
        const payload = buildSurfaceLayoutRegistryResponse();
        expect(payload.contract_version).toBe(1);
        expect(payload.enabled.map((s) => s.surface_key)).toEqual([
            "opportunity_drawer",
            "person_drawer",
            "child_drawer",
        ]);
        expect(payload.coming_soon.map((s) => s.surface_key)).toEqual([
            "queue_record",
            "communications_command_center",
            "pos_workspace",
        ]);
        expect(isSurfaceLayoutKey("opportunity_drawer")).toBe(true);
        expect(OPPORTUNITY_DRAWER_SURFACE.platformShellSlots).toContain("lifecycle_rail_container");
        expect(OPPORTUNITY_DRAWER_SURFACE.platformShellSlots).toContain("reveal_gates");
    });

    it("resolves opportunity_drawer from opportunities drawer LayoutDoc", () => {
        const doc = buildLeadDrawerDefaultDoc();
        expect(resolveSurfaceLayoutKeyFromDoc(doc)).toBe("opportunity_drawer");
    });

    it("resolves person_drawer and child_drawer from default LayoutDocs", () => {
        expect(resolveSurfaceLayoutKeyFromDoc(buildPersonDrawerDefaultDoc())).toBe("person_drawer");
        expect(resolveSurfaceLayoutKeyFromDoc(buildChildDrawerDefaultDoc())).toBe("child_drawer");
    });
});

describe("opportunity_drawer surface validation", () => {
    it("accepts the curated default Lead drawer preset", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const structural = parseLayoutDoc(doc);
        expect(structural.ok, structural.errors.join("; ")).toBe(true);

        const withSurface = parseLayoutDoc(doc, { inferSurfaceKey: true });
        expect(withSurface.ok, withSurface.errors.join("; ")).toBe(true);
        expect(withSurface.surfaceKey).toBe("opportunity_drawer");

        const surfaceOnly = validateLayoutDocForSurface(doc, "opportunity_drawer");
        expect(surfaceOnly.ok, surfaceOnly.errors.join("; ")).toBe(true);
    });

    it("rejects unknown layout zone on section metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const mutated: LayoutDoc = {
            ...doc,
            sections: doc.sections.map((s, i) =>
                i === 1 ?
                    {
                        ...s,
                        metadata: { ...(s.metadata ?? {}), layoutZone: "unknown_zone" },
                    }
                :   s,
            ),
        };
        const res = validateLayoutDocForSurface(mutated, "opportunity_drawer");
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("unknown layout zone"))).toBe(true);
    });

    it("rejects unknown field refKey", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "lead_source")!;
        const row = section.rows[0]!;
        const col = row.columns[0]!;
        const mutated: LayoutDoc = {
            ...doc,
            sections: doc.sections.map((s) =>
                s.key === "lead_source" ?
                    {
                        ...s,
                        rows: [
                            {
                                ...row,
                                columns: [
                                    {
                                        ...col,
                                        items: [
                                            ...col.items,
                                            {
                                                id: "bad-field",
                                                kind: "field" as const,
                                                refKey: "opportunity.totally_made_up_field",
                                                label: "Bad",
                                                renderHint: "text" as const,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }
                :   s,
            ),
        };
        const res = validateLayoutDocForSurface(mutated, "opportunity_drawer");
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("unknown field refKey"))).toBe(true);
    });

    it("rejects invalid action placement surface", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const mutated: LayoutDoc = {
            ...doc,
            metadata: {
                ...(doc.metadata ?? {}),
                action_placements: [{ surface: "workspace", slot: "primary" }],
            },
        };
        const res = validateLayoutDocForSurface(mutated, "opportunity_drawer");
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("invalid action placement surface"))).toBe(true);
    });

    it("rejects platform shell metadata control", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const mutated: LayoutDoc = {
            ...doc,
            metadata: {
                ...(doc.metadata ?? {}),
                shell: { tabs: ["overview"] },
            },
        };
        const res = validateLayoutDocForSurface(mutated, "opportunity_drawer");
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("platform shell area is not layout-configurable"))).toBe(
            true,
        );
    });

    it("rejects platform shell-owned section keys", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const mutated: LayoutDoc = {
            ...doc,
            sections: [
                ...doc.sections,
                {
                    id: "shell-section",
                    key: "tabs_container",
                    title: "Tabs",
                    rows: [],
                },
            ],
        };
        const res = validateLayoutDocForSurface(mutated, "opportunity_drawer");
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("platform shell-owned"))).toBe(true);
    });

    it("rejects unknown item kind via structural parse", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections[0]!;
        const row = section.rows[0]!;
        const col = row.columns[0]!;
        const item = col.items[0]!;
        const raw = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
        const sections = raw.sections as Record<string, unknown>[];
        const items = ((sections[0].rows as Record<string, unknown>[])[0].columns as Record<string, unknown>[])[0]
            .items as Record<string, unknown>[];
        items[0] = { ...item, kind: "freeform_block" };
        const res = parseLayoutDoc(raw, { inferSurfaceKey: true });
        expect(res.ok).toBe(false);
        expect(res.errors.some((e) => e.includes("invalid item kind"))).toBe(true);
    });

    it("does not apply surface validation to non-registered entity types without infer flag", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const customersDoc: LayoutDoc = { ...doc, entityType: "customers" };
        const res = parseLayoutDoc(customersDoc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        expect(res.surfaceKey).toBeUndefined();
    });
});

describe("person_drawer surface validation", () => {
    it("accepts the curated default person drawer preset", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const res = validateLayoutDocForSurface(doc, "person_drawer");
        expect(res.ok, res.errors.join("; ")).toBe(true);
    });
});

describe("child_drawer surface validation", () => {
    it("accepts the curated default child drawer preset", () => {
        const doc = buildChildDrawerDefaultDoc();
        const res = validateLayoutDocForSurface(doc, "child_drawer");
        expect(res.ok, res.errors.join("; ")).toBe(true);
    });
});
