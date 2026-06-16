/**
 * Visual Layout Configuration Builder — Phase 5 tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { removeItem } from "@/lib/layout/builderOps";
import type { EntityLayoutRecord, LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import {
    applyMappableLegacyHiddenSectionsToLayoutDoc,
    buildLegacyWorkflowV1LayoutMigrationHints,
    LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS,
    LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE,
} from "@/lib/layout/legacyOpportunityDrawerLayoutConvergence";
import {
    resolveGalleryEditLayoutAction,
    summarizeSurfaceLayoutRecords,
} from "@/lib/layout/layoutGalleryModel";
import { tryAddFieldRefToSection, validateOpportunityDrawerLayoutDoc } from "@/lib/layout/opportunityDrawerLayoutEditorModel";
import { partitionLeadOverviewBodySections, isLeadOverviewKnownBodySectionKey } from "@/lib/layout/runtime/leadOverviewComposition";
import {
    sortLayoutSectionsByDocPosition,
    sectionOrderIndexInDoc,
} from "@/lib/layout/runtime/orderLayoutSectionsByDocPosition";
import { resolveLeadOverviewRightRailSections } from "@/lib/layout/runtime/resolveLeadOverviewRightRailSections";
import { buildProofOpportunityRecord } from "@/lib/layout/runtime/buildProofOpportunityRecord";
import { resolveEffectiveProductionLayoutDoc } from "@/lib/layout/runtime/resolveEffectiveProductionLayoutDoc";
import { collectLayoutItems } from "@/lib/layout/runtime/classifyLayoutItemBinding";

const root = resolve(__dirname, "../..");

function row(partial: Partial<EntityLayoutRecord> & Pick<EntityLayoutRecord, "id" | "version" | "status">): EntityLayoutRecord {
    return {
        id: partial.id,
        orgId: partial.orgId !== undefined ? partial.orgId : "org-1",
        industryKey: partial.industryKey !== undefined ? partial.industryKey : null,
        entityType: partial.entityType ?? "opportunities",
        surface: partial.surface ?? "drawer",
        layoutKey: partial.layoutKey ?? "default",
        name: partial.name ?? "Layout",
        version: partial.version,
        status: partial.status,
        isSystemDefault: partial.isSystemDefault ?? false,
        doc: partial.doc ?? buildLeadDrawerDefaultDoc(),
        metadata: partial.metadata ?? null,
        createdBy: null,
        createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
        updatedAt: partial.updatedAt ?? null,
        publishedAt: partial.publishedAt ?? null,
    };
}

describe("legacy opportunity layout convergence", () => {
    it("audits record_drawer_layouts write paths", () => {
        expect(LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS.length).toBeGreaterThanOrEqual(3);
        expect(LEGACY_OPPORTUNITY_DRAWER_LAYOUT_WRITE_PATHS.map((p) => p.id)).toContain("workflow_v1_sections");
    });

    it("legacy banner exposes read-only data attribute when visual config gate is wired", () => {
        const banner = readFileSync(
            resolve(root, "components/adminV2/settings/LegacyWorkflowV1LayoutEditorBanner.tsx"),
            "utf8",
        );
        expect(banner).toContain("data-legacy-layout-read-only");
        expect(banner).toContain("isLayoutRuntimeOpportunityDrawerEntityLayoutsVisualConfigEnabledClient");
    });

    it("legacy section/order API routes use write guard", () => {
        const sections = readFileSync(
            resolve(root, "app/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections/route.ts"),
            "utf8",
        );
        const order = readFileSync(
            resolve(root, "app/api/admin/record-drawer-layouts/opportunity-workflow-v1-order/route.ts"),
            "utf8",
        );
        expect(sections).toContain("assertLegacyOpportunityLayoutWriteAllowed");
        expect(order).toContain("assertLegacyOpportunityLayoutWriteAllowed");
        const guard = readFileSync(resolve(root, "lib/admin/legacyOpportunityLayoutWriteGuard.ts"), "utf8");
        expect(guard).toContain("LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE");
        const convergence = readFileSync(
            resolve(root, "lib/layout/legacyOpportunityDrawerLayoutConvergence.ts"),
            "utf8",
        );
        expect(convergence).toContain(LEGACY_OPPORTUNITY_LAYOUT_WRITE_BLOCKED_CODE);
    });

    it("maps mappable legacy hidden keys onto LayoutDoc", () => {
        const doc = applyMappableLegacyHiddenSectionsToLayoutDoc(buildLeadDrawerDefaultDoc(), {
            overview_hidden_sections: ["notes"],
        });
        const notes = doc.sections.find((s) => s.key === "notes_communication");
        expect(notes?.metadata?.layoutEditorHidden).toBe(true);
    });

    it("builds migration hints for unmappable legacy keys", () => {
        const hints = buildLegacyWorkflowV1LayoutMigrationHints({
            overview_hidden_sections: ["opportunity_details"],
            overview_section_order: ["a", "b"],
        });
        expect(hints.some((h) => h.code === "unmapped_hidden_keys")).toBe(true);
        expect(hints.some((h) => h.code === "section_order")).toBe(true);
    });
});

describe("gallery published-row edit routing", () => {
    it("opens existing draft directly", () => {
        const identity = { entityType: "opportunities", surface: "drawer" as const, layoutKey: "default" };
        const summary = summarizeSurfaceLayoutRecords(
            [
                row({ id: "pub-1", version: 1, status: "published" }),
                row({ id: "draft-2", version: 2, status: "draft" }),
            ],
            "org-1",
            identity,
        );
        expect(resolveGalleryEditLayoutAction(summary)).toEqual({ mode: "open", layoutId: "draft-2" });
    });

    it("duplicates published layout when no draft exists", () => {
        const identity = { entityType: "opportunities", surface: "drawer" as const, layoutKey: "default" };
        const summary = summarizeSurfaceLayoutRecords(
            [row({ id: "pub-1", version: 1, status: "published" })],
            "org-1",
            identity,
        );
        expect(resolveGalleryEditLayoutAction(summary)).toEqual({
            mode: "duplicate_then_open",
            sourceLayoutId: "pub-1",
        });
    });
});

describe("runtime section order and fields from entity_layouts", () => {
    it("sorts right-rail sections by LayoutDoc.sections order when visual config ctx is on", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const activity = doc.sections.find((s) => s.key === "activity")!;
        const notes = doc.sections.find((s) => s.key === "notes_communication")!;
        doc = {
            ...doc,
            sections: doc.sections.filter((s) => s.key !== "activity" && s.key !== "notes_communication"),
        };
        doc = { ...doc, sections: [...doc.sections, notes, activity] };

        const slots = partitionLeadOverviewBodySections(doc);
        const record = buildProofOpportunityRecord();
        const ordered = resolveLeadOverviewRightRailSections(slots, record, {
            compositionShell: true,
            opportunityEntityLayoutsVisualConfig: true,
        }, doc);

        expect(ordered.map((s) => s.key)).toEqual(["notes_communication", "activity"]);
        expect(sectionOrderIndexInDoc(doc, "notes_communication")).toBeLessThan(
            sectionOrderIndexInDoc(doc, "activity"),
        );
    });

    it("respects field removal in runtime plan sections", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const ls = doc.sections.find((s) => s.key === "lead_source")!;
        const sIdx = doc.sections.findIndex((s) => s.key === "lead_source");
        const item = ls.rows[0]!.columns[0]!.items[0]!;
        const without = removeItem(doc, sIdx, 0, 0, item.id);
        const section = without.sections.find((s) => s.key === "lead_source")!;
        const items = collectLayoutItems({ sections: [section] });
        expect(items.some((i) => i.id === item.id)).toBe(false);
    });

    it("routes unknown body section keys to overflow safely", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const custom: LayoutSection = {
            id: "sec-custom",
            key: "custom_future_section",
            title: "Custom",
            collapsible: true,
            defaultExpanded: true,
            rows: [],
        };
        const withCustom = { ...doc, sections: [...doc.sections, custom] };
        const slots = partitionLeadOverviewBodySections(withCustom);
        expect(isLeadOverviewKnownBodySectionKey("custom_future_section")).toBe(false);
        expect(slots.overflow.some((s) => s.key === "custom_future_section")).toBe(true);
    });

    it("falls back when published doc sections are unsupported for production", () => {
        const result = resolveEffectiveProductionLayoutDoc({
            doc: {
                formatVersion: 1,
                surface: "drawer",
                entityType: "opportunities",
                sections: [
                    {
                        id: "x",
                        key: "custom_future_section",
                        title: "X",
                        collapsible: true,
                        defaultExpanded: true,
                        rows: [],
                    },
                ],
            },
            source: "org",
            entityType: "opportunities",
            surface: "drawer",
        });
        expect(result.usedFallback).toBe(true);
    });

    it("sortLayoutSectionsByDocPosition is stable for absent keys", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const sections = doc.sections.filter((s) => s.key === "activity" || s.key === "notes_communication");
        const sorted = sortLayoutSectionsByDocPosition(doc, [...sections].reverse());
        expect(sorted[0]!.key).toBe(
            sectionOrderIndexInDoc(doc, "notes_communication") <
                sectionOrderIndexInDoc(doc, "activity") ?
                "notes_communication"
            :   "activity",
        );
    });
});

describe("visual editor registry validation", () => {
    it("rejects invalid field refs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const result = tryAddFieldRefToSection(doc, "lead_source", "not.valid.field", "Bad");
        expect(result.ok).toBe(false);
    });

    it("validates default opportunity drawer doc", () => {
        const result = validateOpportunityDrawerLayoutDoc(buildLeadDrawerDefaultDoc());
        expect(result.ok).toBe(true);
    });

    it("visual editor includes searchable field picker and live publish notice", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("OpportunityDrawerLayoutFieldPicker");
        expect(editor).toContain("visual-editor-live-publish-notice");
        expect(editor).toContain("visual-editor-main-composition-grid");
    });

    it("gallery duplicates published layout before edit when no draft", () => {
        const gallery = readFileSync(resolve(root, "components/adminV2/settings/LayoutGalleryClient.tsx"), "utf8");
        expect(gallery).toContain("resolveGalleryEditLayoutAction");
        expect(gallery).toContain("/duplicate");
    });
});

describe("legacy parse compatibility", () => {
    it("parseLayoutDoc accepts layoutEditorHidden after Phase 4", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const section = doc.sections[0]!;
        const withMeta = {
            ...doc,
            sections: [{ ...section, metadata: { ...(section.metadata ?? {}), layoutEditorHidden: true } }],
        };
        const parsed = parseLayoutDoc(withMeta, { inferSurfaceKey: true });
        expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
    });
});
