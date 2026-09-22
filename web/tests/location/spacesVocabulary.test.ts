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

describe("two operator types, not three", () => {
    it("offers exactly Classroom and Physical space", () => {
        expect(ROOM_TYPE_OPTIONS.map((o) => o.label)).toEqual(["Classroom", "Physical space"]);
    });

    it("never offers Shared space to author", () => {
        expect(ROOM_TYPE_OPTIONS.some((o) => o.role === "shared_space")).toBe(false);
    });

    it("calls the old physical type a Physical space, not a Physical room", () => {
        // "Physical room" could not honestly cover a playground, which is the
        // whole reason the type absorbs the shared space.
        expect(roomTypeLabel("physical_space")).toBe("Physical space");
    });
});

describe("a stored shared space keeps working", () => {
    it("presents as a Physical space", () => {
        expect(roomTypeLabel("shared_space")).toBe("Physical space");
    });

    it("is offered in its own editor without a duplicate Physical space entry", () => {
        const options = roomTypeOptionsFor("shared_space");
        expect(options.map((o) => o.label)).toEqual(["Classroom", "Physical space"]);
        // The Physical space slot is the STORED role, so saving without touching
        // Type leaves storage exactly as it was.
        expect(options.find((o) => o.label === "Physical space")?.role).toBe("shared_space");
    });

    it("an ordinary object never sees the shared role", () => {
        expect(roomTypeOptionsFor("operational_group").some((o) => o.role === "shared_space")).toBe(false);
        expect(roomTypeOptionsFor(null).some((o) => o.role === "shared_space")).toBe(false);
    });

    it("carries no classroom-only fields, exactly like a physical space", () => {
        expect(roleUsesProgramFields("shared_space")).toBe(false);
        expect(roleUsesProgramFields("physical_space")).toBe(false);
        expect(roleUsesProgramFields("operational_group")).toBe(true);
    });

    it("still cannot contain a classroom, because the mutation authority refuses it", () => {
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
