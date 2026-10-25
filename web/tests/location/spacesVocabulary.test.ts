/**
 * The operator vocabulary after the simplification: two types, one collection
 * noun, and a stored shared space that still works.
 *
 * These are copy assertions, which normally earn their keep poorly. They earn
 * it here because the whole point of the slice is that a director meets fewer
 * words — a third type quietly reappearing in the picker is exactly the
 * regression nobody would notice in a diff.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    ROOM_TYPE_OPTIONS,
    roomTypeLabel,
    roomTypeOptionsFor,
    roleUsesProgramFields,
    roleAcceptsInside,
} from "@/lib/locations/roomTypeVocabulary";
import { LOCATION_WORKSPACE_TABS } from "@/lib/locations/locationWorkspaceModel";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("three operator kinds (V7 S2)", () => {
    it("offers Operational, Shared and Physical", () => {
        expect(ROOM_TYPE_OPTIONS.map((o) => o.label)).toEqual(["Operational", "Shared", "Physical"]);
        expect(ROOM_TYPE_OPTIONS.map((o) => o.role)).toEqual(["operational_group", "shared_space", "physical_space"]);
    });

    it("calls the structural distinction Physical, not Classroom-versus-room", () => {
        expect(roomTypeLabel("physical_space")).toBe("Physical");
    });
});

describe("a shared space is its own kind again", () => {
    it("presents as Shared, never folded into Physical", () => {
        expect(roomTypeLabel("shared_space")).toBe("Shared");
    });

    it("every space is offered the same three kinds, so a stored role is never rewritten by opening the editor", () => {
        for (const role of ["operational_group", "shared_space", "physical_space", null] as const) {
            expect(roomTypeOptionsFor(role).map((o) => o.role)).toEqual(["operational_group", "shared_space", "physical_space"]);
        }
    });

    it("carries no operational-only fields, exactly like a physical space", () => {
        expect(roleUsesProgramFields("shared_space")).toBe(false);
        expect(roleUsesProgramFields("physical_space")).toBe(false);
        expect(roleUsesProgramFields("operational_group")).toBe(true);
    });

    it("still cannot contain an operational space, because the mutation authority refuses it", () => {
        // The one residual difference from a real physical space. Offering it as
        // a container would offer a choice the server rejects.
        expect(roleAcceptsInside("shared_space")).toBe(false);
        expect(roleAcceptsInside("operational_group")).toBe(true);
    });
});

describe("the collection is called Spaces", () => {
    it("names the workspace tab Spaces", () => {
        expect(LOCATION_WORKSPACE_TABS.find((t) => t.key === "rooms")?.label).toBe("Spaces");
    });

    it("says Spaces, Add space and Select a space in the surface", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(panel).toContain('listTitle="Spaces"');
        expect(panel).toContain("+ Add space");
        expect(panel).toContain('title="Select a space"');
        expect(panel).toContain('title="No spaces yet"');
    });

    it("no longer tells the operator their capacity lives in Operational Rules", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        const capacity = read("components/adminV2/settings/locations/RoomCapacitySection.tsx");
        expect(panel).not.toContain("Capacity for this room is set in Operational Rules");
        expect(capacity).not.toContain("No capacity configured for this room");
        expect(capacity).not.toContain("Manage capacity rules");
    });
});

describe("an ordinary save no longer writes the ambiguous legacy field", () => {
    it("omits capacity from the room metadata patch", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        const save = panel.slice(panel.indexOf("writeRoomProgramsAndScheduleMetadata({"));
        const firstCall = save.slice(0, save.indexOf("});"));
        // Omitting the key entirely is load-bearing: passing null would DELETE an
        // unreviewed legacy value and destroy the migration state that the
        // existing review flow still needs.
        expect(firstCall).not.toContain("capacity");
    });

    it("routes the typed number through the canonical authoring action", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(panel).toContain('action: "set_object_capacity"');
        expect(panel).toContain("/api/admin/operational-config/capacity-rules");
    });

    it("keeps the legacy review flow available", () => {
        const capacity = read("components/adminV2/settings/locations/RoomCapacitySection.tsx");
        expect(capacity).toContain("Needs review");
        expect(capacity).toContain("locations-room-capacity-confirm");
    });
});
