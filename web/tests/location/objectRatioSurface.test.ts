/**
 * Locks for the object-centric operating model.
 *
 * These are source-level guards. They exist because the things they protect are
 * invisible in a diff: a Kind picker quietly regaining a third option, a ratio
 * write quietly going to metadata, a conflict quietly resolving itself, or the
 * rules page quietly returning to the primary tabs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    LOCATION_WORKSPACE_ADVANCED_TABS,
    LOCATION_WORKSPACE_TABS,
} from "@/lib/locations/locationWorkspaceModel";
import { ROOM_TYPE_OPTIONS, roomTypeLabel } from "@/lib/locations/roomTypeVocabulary";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PANEL = "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx";
const RATIO = "components/adminV2/settings/locations/SpaceRatioSection.tsx";
const PAGE = "components/adminV2/settings/locations/LocationsConfigurationPage.tsx";

describe("Kind is the structural word, and there are only two", () => {
    it("offers Operational and Physical, and nothing else", () => {
        expect(ROOM_TYPE_OPTIONS.map((o) => o.label)).toEqual(["Operational", "Physical"]);
    });

    it("a stored shared space presents as Physical", () => {
        expect(roomTypeLabel("shared_space")).toBe("Physical");
    });

    it("the editors label the field Kind, and the relationship Physical space", () => {
        for (const file of [PANEL, "components/adminV2/settings/locations/LocationRoomCreatePanel.tsx"]) {
            const src = read(file);
            expect(src).toContain(">Kind</span>");
            expect(src).toContain(">Physical space</span>");
            // "Inside" was a nesting lesson; this is a relationship.
            expect(src).not.toContain(">Inside</span>");
        }
    });
});

describe("the rail can be narrowed by Kind", () => {
    it("offers All, Operational and Physical", () => {
        const src = read(PANEL);
        // The ids are template-generated, so the keys are what to assert.
        expect(src).toContain("locations-room-kind-filter-${key}");
        const block = src.slice(src.indexOf("listFilter={"), src.indexOf("listFilter={") + 900);
        for (const key of ['"all"', '"operational"', '"physical"']) {
            expect(block).toContain(key);
        }
        for (const label of ['"All"', '"Operational"', '"Physical"']) {
            expect(block).toContain(label);
        }
    });

    it("filters presentation only — it renders no second classification", () => {
        const src = read(PANEL);
        // The filter narrows `visibleRooms`; it must never write anything.
        const block = src.slice(src.indexOf("const visibleRooms"), src.indexOf("const visibleRooms") + 400);
        expect(block).not.toContain("fetch(");
        expect(block).not.toContain("onSave");
    });
});

describe("the physical side shows what it supports", () => {
    it("reads the association from the canonical parent relationship", () => {
        const src = read(PANEL);
        const block = src.slice(src.indexOf("const operationalSpacesIn"), src.indexOf("const operationalSpacesIn") + 400);
        expect(block).toContain("parent_location_id");
        // No second association table, no duplicated topology state.
        expect(block).not.toContain("association");
        expect(src).toContain('key: "operational-spaces"');
    });
});

describe("ratio is authored on the object, canonically", () => {
    it("posts the derived action from the space's own save, never a metadata ratio", () => {
        // The editor moved INTO the one Space edit form, so the write now lives
        // in the panel and is saved by the same button as name and capacity.
        const src = read(PANEL);
        expect(src).toContain('action: "set_object_ratio"');
        expect(src).toContain("/api/admin/operational-config/ratio-rules");
        for (const forbidden of ["metadata.ratio", "student_teacher_ratio ="]) {
            expect(src).not.toContain(forbidden);
        }
    });

    it("never writes the legacy string it reads", () => {
        const src = read(RATIO);
        // It READS metadata.student_teacher_ratio to detect a conflict; it must
        // never send one anywhere.
        const sends = src.slice(src.indexOf("JSON.stringify("), src.indexOf("JSON.stringify(") + 300);
        expect(sends).not.toContain("student_teacher_ratio");
    });

    it("keeps every tier — there is no single-ratio field", () => {
        const src = read(RATIO);
        expect(src).toContain("locations-space-ratio-add-tier");
        expect(src).toContain("staff for up to");
    });

    it("states the three seeding cases in one place", () => {
        /*
         * CORRECTION. An earlier commit claimed a hydration defect here: a space
         * read 1:5 - 2:11 while its editor opened empty. That was not a defect —
         * the space was in CONFLICT, and an empty editor is the designed
         * behaviour, because pre-filling one of two disagreeing staffing records
         * would answer a staffing-law question the moment someone pressed Save.
         *
         * What the investigation did find is this: a LEGACY-ONLY space also
         * opened empty, which loses the one-click confirmation the operator is
         * told to expect. That is fixed, and the rule now lives in one function
         * rather than being restated at each call site.
         */
        const src = read(PANEL);
        const seed = src.slice(src.indexOf("const ratioSeedFor"), src.indexOf("const ratioSeedFor") + 500);
        expect(seed).toContain('standing.state === "conflict"');
        expect(seed).toContain('standing.state === "legacy_only"');
        expect(seed).toContain("readObjectRatioTiers(standing)");
        // Both the room change and the Edit click go through the same rule.
        expect(src).toContain("ratioSeedFor(next)");
        expect(src).toContain("ratioSeedFor(room)");
    });

    it("a conflict seeds the edit form with NEITHER record", () => {
        // Seeding one of two disagreeing staffing records would decide a
        // staffing-law question silently, on nothing but form convenience.
        const src = read(PANEL);
        const seed = src.slice(src.indexOf("const ratioSeedFor"), src.indexOf("const ratioSeedFor") + 500);
        expect(seed).toContain('if (standing.state === "conflict") return [];');
    });

    it("the tier grid labels Staff and Children once, not around every input", () => {
        const src = read(RATIO);
        expect(src).toContain(">Staff</span>");
        expect(src).toContain(">Children</span>");
        expect(src).toContain("+ Add tier");
        // The old shape repeated prose between every field.
        expect(src).not.toContain("staff for up to</span>");
    });

    it("ordinary Space detail no longer advertises the rule engine", () => {
        const src = read(PANEL);
        expect(src).not.toContain("RoomCapacitySection");
        expect(src).not.toContain("Advanced rules");
        expect(src).not.toContain("Capacity limits");
    });

    it("the page supplies the canonical ratio data to the panel", () => {
        const src = read(PAGE);
        expect(src).toContain("ratioRules={ratioRules}");
        expect(src).toContain("ratioTiers={ratioRuleTiers}");
    });
});

describe("Operational Rules is demoted, not deleted", () => {
    it("is absent from the primary Site tabs", () => {
        // Widened deliberately: the key is no longer in the primary union, so a
        // narrow comparison is a type error rather than a runtime guard — and the
        // guard is the point, because it must fail if someone re-adds the tab.
        const primary = LOCATION_WORKSPACE_TABS as readonly { key: string }[];
        expect(primary.some((t) => t.key === "operational-rules")).toBe(false);
    });

    it("remains a declared, routable advanced destination", () => {
        expect(LOCATION_WORKSPACE_ADVANCED_TABS.some((t) => t.key === "operational-rules")).toBe(true);
    });

    it("is still reachable from the space whose facts it governs", () => {
        const capacity = read("components/adminV2/settings/locations/RoomCapacitySection.tsx");
        expect(capacity).toContain("operational-rules");
        expect(capacity).toContain("Advanced rules and history");
    });
});
