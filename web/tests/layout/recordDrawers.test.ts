/**
 * Layout V2 — Person & Child record drawers + catalog cleanup (completion pass).
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { buildPersonDrawerDefaultDoc, buildChildDrawerDefaultDoc, buildRecordDrawerDefaultDoc } from "@/lib/layout/defaultRecordDrawers";
import {
    catalogGroupsForEntityType,
    catalogWidgetsForEntityType,
    GLOBAL_WIDGET_CATALOG,
    LAYOUT_ENTITY_GROUPS,
    WIDGET_CATEGORIES,
} from "@/lib/layout/fieldCatalog";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

const refKeysOf = (doc: LayoutDoc): string[] =>
    doc.sections.flatMap((s) => s.rows).flatMap((r) => r.columns).flatMap((c) => c.items).flatMap((it) => [it.refKey, ...(it.columns ?? []).map((col) => col.refKey)]);
const titlesOf = (doc: LayoutDoc): string[] => doc.sections.map((s) => s.title);

describe("Person drawer preset", () => {
    const doc = buildPersonDrawerDefaultDoc();
    it("is a valid person drawer with the expected sections", () => {
        expect(parseLayoutDoc(doc).ok, parseLayoutDoc(doc).errors.join("; ")).toBe(true);
        expect(doc.surface).toBe("drawer");
        expect(doc.entityType).toBe("person");
        expect(titlesOf(doc)).toEqual([
            "Person Summary",
            "Household",
            "Connected Children",
            "Contact Information",
            "Notes / Recent Communication",
            "Recent Activity",
            "Documents",
        ]);
    });
    it("includes core summary fields + widget placeholders", () => {
        const refs = refKeysOf(doc);
        expect(refs).toContain("person.primary_contact_name");
        expect(refs).toContain("person.primary_phone");
        expect(refs).toContain("person.primary_email");
        expect(refs).toContain("household_children");
        expect(refs).toContain("recent_communication");
        expect(refs).toContain("notes");
        expect(refs).toContain("household_summary");
        expect(refs).toContain("connected_children");
        expect(refs).toContain("last_touch");
    });
});

describe("Child drawer preset", () => {
    const doc = buildChildDrawerDefaultDoc();
    it("is a valid child drawer with the expected sections", () => {
        expect(parseLayoutDoc(doc).ok, parseLayoutDoc(doc).errors.join("; ")).toBe(true);
        expect(doc.entityType).toBe("child");
        expect(titlesOf(doc)).toEqual([
            "Child Summary",
            "Program & Enrollment",
            "Family",
            "Enrollment & schedule",
            "Notes / Communication",
            "Recent Activity",
            "Documents",
        ]);
    });
    it("uses canonical child.* / inquiry_child.* refKeys — never new child_inquiry.*", () => {
        const refs = refKeysOf(doc);
        expect(refs).toContain("inquiry_child.program");
        expect(refs).toContain("inquiry_child.program_category_id");
        expect(refs).toContain("family_adults");
        expect(refs).toContain("program_enrollment");
        expect(refs).toContain("family");
        expect(refs).toContain("last_touch");
        expect(refs.some((r) => r.startsWith("child_inquiry."))).toBe(false);
        expect(doc.metadata?.template).toBe("child_drawer_v2");
    });
    it("buildRecordDrawerDefaultDoc only serves person/child drawers", () => {
        expect(buildRecordDrawerDefaultDoc("person", "drawer")).not.toBeNull();
        expect(buildRecordDrawerDefaultDoc("child", "drawer")).not.toBeNull();
        expect(buildRecordDrawerDefaultDoc("child", "queue")).toBeNull();
        expect(buildRecordDrawerDefaultDoc("opportunities", "drawer")).toBeNull();
    });
});

describe("resolver serves curated person/child drawers", () => {
    it("resolves person + child drawers to the curated default", () => {
        const p = resolveLayout({ entityType: "person", surface: "drawer" });
        expect(p.source).toBe("default");
        expect(p.doc.entityType).toBe("person");
        const c = resolveLayout({ entityType: "child", surface: "drawer" });
        expect(c.source).toBe("default");
        expect(c.doc.entityType).toBe("child");
    });
});

describe("field catalog cleanup (user-facing labels)", () => {
    it("Lead-drawer groups use plain labels (no raw entity names)", () => {
        const labels = LAYOUT_ENTITY_GROUPS.map((g) => g.entityLabel);
        expect(labels).toContain("Lead");
        expect(labels).toContain("Parent / Contact");
        expect(labels).not.toContain("Lead / Opportunity");
        expect(labels).not.toContain("Children Inquiry");
        expect(labels.filter((l) => l === "Child").length).toBeGreaterThan(0);
    });
    it("waitlist groups are friendly (Candidate, Waitlist — not technical)", () => {
        const labels = (catalogGroupsForEntityType("placement_candidate") ?? []).map((g) => g.entityLabel);
        expect(labels).toContain("Candidate");
        expect(labels).toContain("Waitlist");
        expect(labels).not.toContain("Placement Candidate");
        expect(labels).not.toContain("Waitlist (runtime-computed)");
    });
    it("person/child surfaces get childcare-organized catalogs", () => {
        expect((catalogGroupsForEntityType("person") ?? []).map((g) => g.entityLabel)).toContain("Parent / Contact");
        const childGroups = catalogGroupsForEntityType("child") ?? [];
        expect(childGroups.find((g) => g.entityLabel === "Child")?.fields.length).toBeGreaterThan(0);
    });
});

describe("widget catalog cleanup (global, categorized)", () => {
    it("returns ONE global catalog on every surface (widgets don't disappear)", () => {
        expect(catalogWidgetsForEntityType()).toBe(GLOBAL_WIDGET_CATALOG);
        expect(catalogWidgetsForEntityType()).toBe(GLOBAL_WIDGET_CATALOG);
        expect(catalogWidgetsForEntityType()).toBe(GLOBAL_WIDGET_CATALOG);
    });
    it("every widget has a friendly label, category, and description (no raw keys exposed)", () => {
        for (const w of GLOBAL_WIDGET_CATALOG) {
            expect(w.label).toBeTruthy();
            expect(WIDGET_CATEGORIES).toContain(w.category);
            expect(w.description).toBeTruthy();
        }
    });
    it("waitlist widgets are flagged queue-relevant (disabled on drawers, not hidden)", () => {
        const pos = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === "waitlist_position");
        expect(pos?.category).toBe("Waitlist");
        expect(pos?.relevantSurfaces).toEqual(["queue"]);
    });
});
