import { describe, expect, it } from "vitest";
import {
    CANONICAL_ACTION_REGISTRY,
    canonicalActionDefinition,
    isCanonicalRelationshipExecutor,
} from "@/lib/admin/actions/canonicalActionRegistry";
import {
    ENROLLMENT_STAGE_ACTION_KEYS,
    resolveLayoutBuilderAvailableActions,
} from "@/lib/admin/actions/canonicalActionAvailability";
import { buildLayoutEditorActionCatalogGroups } from "@/lib/layout/layoutEditorActionCatalog";
import { RELATIONSHIP_ACTION_KEYS } from "@/lib/admin/relationship/relationshipActionContract";

describe("canonicalActionRegistry", () => {
    it("includes all relationship action keys with relationship executor", () => {
        for (const key of RELATIONSHIP_ACTION_KEYS) {
            const def = canonicalActionDefinition(key);
            expect(def?.actionKey).toBe(key);
            expect(def?.category).toBe("relationship");
            if (key === "make_primary_contact") {
                expect(def?.executor.kind).toBe("dedicated_modal");
            } else {
                expect(isCanonicalRelationshipExecutor(key)).toBe(true);
            }
        }
    });

    it("dedupes add_child to relationship executor over legacy platform entry", () => {
        const def = canonicalActionDefinition("add_child");
        expect(def?.executor.kind).toBe("relationship_execute");
    });

    it("registers platform library actions", () => {
        expect(canonicalActionDefinition("schedule_tour")?.executor.kind).toBe("admin_execute");
        expect(CANONICAL_ACTION_REGISTRY.some((entry) => entry.actionKey === "quick_message")).toBe(true);
    });
});

describe("canonicalActionAvailability", () => {
    it("shows emergency contact on child drawer section_row", () => {
        const rows = resolveLayoutBuilderAvailableActions({
            surfaceKey: "child_drawer",
            context: "section_row",
        });
        expect(rows.some((row) => row.actionKey === "add_emergency_contact" && row.available)).toBe(true);
    });

    it("hides emergency contact on opportunity drawer section_row", () => {
        const rows = resolveLayoutBuilderAvailableActions({
            surfaceKey: "opportunity_drawer",
            context: "section_row",
        });
        expect(rows.some((row) => row.actionKey === "add_emergency_contact")).toBe(false);
    });

    it("filters by enrollment waitlist stage when stage is provided", () => {
        const waitlist = resolveLayoutBuilderAvailableActions({
            surfaceKey: "child_drawer",
            context: "section_row",
            lifecycleStageKey: "waitlist",
        });
        expect(waitlist.some((row) => row.actionKey === "add_emergency_contact")).toBe(true);

        const enrolled = resolveLayoutBuilderAvailableActions({
            surfaceKey: "child_drawer",
            context: "section_row",
            lifecycleStageKey: "enrolled",
        });
        expect(enrolled.some((row) => row.actionKey === "add_emergency_contact")).toBe(false);
    });

    it("hides make_primary_contact on opportunity drawer section_row", () => {
        const rows = resolveLayoutBuilderAvailableActions({
            surfaceKey: "opportunity_drawer",
            context: "section_row",
        });
        expect(rows.some((row) => row.actionKey === "make_primary_contact")).toBe(false);
    });

    it("shows make_primary_contact on contact_block", () => {
        const rows = resolveLayoutBuilderAvailableActions({
            surfaceKey: "opportunity_drawer",
            context: "contact_block",
        });
        const row = rows.find((entry) => entry.actionKey === "make_primary_contact");
        expect(row?.available).toBe(true);
    });

    it("intersects with dbAvailableKeys when provided", () => {
        const rows = resolveLayoutBuilderAvailableActions({
            surfaceKey: "child_drawer",
            context: "section_row",
            dbAvailableKeys: ["add_authorized_pickup"],
        });
        expect(rows.some((row) => row.actionKey === "add_authorized_pickup")).toBe(true);
        expect(rows.some((row) => row.actionKey === "add_emergency_contact")).toBe(false);
    });

    it("builder catalog groups use canonical availability", () => {
        const groups = buildLayoutEditorActionCatalogGroups({
            surfaceKey: "child_drawer",
            context: "section_row",
            lifecycleStageKey: "lead",
        });
        const relationship = groups.find((group) => group.groupKey === "relationship_actions");
        expect(relationship?.actions.some((action) => action.actionKey === "add_emergency_contact")).toBe(true);
    });

    it("documents enrollment stage action sets", () => {
        expect(ENROLLMENT_STAGE_ACTION_KEYS.lead).toContain("add_emergency_contact");
        expect(ENROLLMENT_STAGE_ACTION_KEYS.waitlist).toContain("add_sibling");
    });
});
