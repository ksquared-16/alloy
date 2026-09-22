/**
 * Slice 5 — one canonical topology presentation.
 *
 * The grammar an operator reads, locked against the rows the product actually
 * produces. The blank nested subtitle Slice 4 pinned as evidence is repaired
 * here, so the pinned test is replaced rather than preserved.
 */
import { describe, expect, it } from "vitest";
import {
    presentRoomTopology,
    roomRailTopologySegments,
    scopeOptionLabel,
    roomSiteLabel,
} from "@/lib/locations/topologyPresentation";
import { resolveRowSiteId } from "@/lib/location/canonicalRoomProvider";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";

function row(over: Partial<LocationHierarchyRow> & { id: string }): LocationHierarchyRow {
    return {
        label: null,
        location_type: "unit",
        parent_location_id: null,
        is_active: true,
        city: null,
        state: null,
        ...over,
    };
}

// The Slice 4 representative topology, exactly as Add Room creates it.
const SITE = row({ id: "site", label: "North Campus", location_type: "site" });
const ROOM1 = row({ id: "room1", label: "Room 1", unit_role: "physical_space", parent_location_id: "site" });
const TOD1 = row({ id: "tod1", label: "Toddler 1", unit_role: "operational_group", parent_location_id: "room1" });
const TOD2 = row({ id: "tod2", label: "Toddler 2", unit_role: "operational_group", parent_location_id: "room1" });
const INFANT = row({ id: "infant", label: "Infant Room", unit_role: "operational_group", parent_location_id: "site" });
const PLAY = row({ id: "play", label: "Playground", unit_role: "shared_space", parent_location_id: "site" });
const LEGACY = row({ id: "legacy", label: "Old Room", unit_role: "operational_group", parent_location_id: "site" });
const ROWS = [SITE, ROOM1, TOD1, TOD2, INFANT, PLAY, LEGACY];

// ---------------------------------------------------------------------------
// 1-5 — the four grammars, and the historical row.
// ---------------------------------------------------------------------------
describe("1-5. operator grammar", () => {
    it("1. a nested Classroom reads Classroom · Room 1 · North Campus", () => {
        expect(presentRoomTopology(TOD1, ROWS).subtitle).toBe("Operational · Room 1 · North Campus");
    });

    it("2. a direct-site Classroom reads Classroom · North Campus, with no fabricated room", () => {
        const p = presentRoomTopology(INFANT, ROWS);
        expect(p.subtitle).toBe("Operational · North Campus");
        expect(p.containingSpaceLabel).toBeNull();
    });

    it("3. a Physical space reads Physical space · North Campus — never Classroom", () => {
        const p = presentRoomTopology(ROOM1, ROWS);
        expect(p.subtitle).toBe("Physical · North Campus");
        expect(p.typeLabel).not.toBe("Operational");
    });

    it("4. a stored Shared space now reads Physical space · North Campus with no containing segment", () => {
        const p = presentRoomTopology(PLAY, ROWS);
        expect(p.subtitle).toBe("Physical · North Campus");
        expect(p.containingSpaceLabel).toBeNull();
    });

    it("5. a historical NULL-role row presents as Classroom", () => {
        const historical = row({ id: "hist", label: "Pre-K", parent_location_id: "site" });
        expect(historical.unit_role).toBeUndefined();
        expect(presentRoomTopology(historical, [SITE, historical]).subtitle).toBe("Operational · North Campus");
    });

    it("never leaks database vocabulary into operator copy", () => {
        for (const r of [TOD1, ROOM1, PLAY, INFANT]) {
            const s = presentRoomTopology(r, ROWS).subtitle;
            expect(s).not.toMatch(/unit_role|operational_group|physical_space|shared_space|parent_location_id/);
        }
    });
});

// ---------------------------------------------------------------------------
// 6-7 — ancestry, and never a blank subtitle.
// ---------------------------------------------------------------------------
describe("6-7. canonical ancestry, no blanks", () => {
    it("6. resolves a nested Classroom to the SITE, not to its containing room", () => {
        const byId = new Map(ROWS.map((r) => [r.id, r]));
        expect(resolveRowSiteId(TOD1, byId)).toBe("site");
        expect(presentRoomTopology(TOD1, ROWS).siteLabel).toBe("North Campus");
    });

    it("7. no room in the representative topology renders a blank subtitle", () => {
        for (const r of [ROOM1, TOD1, TOD2, INFANT, PLAY, LEGACY]) {
            const s = presentRoomTopology(r, ROWS).subtitle;
            expect(s.length).toBeGreaterThan(0);
            expect(s).not.toContain("—");
            expect(s).not.toContain("undefined");
            expect(s).not.toMatch(/·\s*·/);
            expect(s.trim()).not.toMatch(/·\s*$/);
        }
    });

    it("drops the site segment rather than inventing one when ancestry fails", () => {
        const orphan = row({ id: "orphan", label: "Floating", unit_role: "operational_group", parent_location_id: null });
        const p = presentRoomTopology(orphan, [orphan]);
        expect(p.subtitle).toBe("Operational");
        expect(p.siteLabel).toBeNull();
    });

    it("refuses to resolve through a cycle", () => {
        const a = row({ id: "a", label: "A", parent_location_id: "b" });
        const b = row({ id: "b", label: "B", parent_location_id: "a" });
        expect(presentRoomTopology(a, [a, b]).siteLabel).toBeNull();
    });

    it("keeps each site's rooms on their own campus", () => {
        const siteB = row({ id: "siteB", label: "South Campus", location_type: "site" });
        const roomB = row({ id: "roomB", label: "Room B", unit_role: "physical_space", parent_location_id: "siteB" });
        const todB = row({ id: "todB", label: "Toddler B", unit_role: "operational_group", parent_location_id: "roomB" });
        const all = [...ROWS, siteB, roomB, todB];
        expect(presentRoomTopology(todB, all).subtitle).toBe("Operational · Room B · South Campus");
        expect(presentRoomTopology(TOD1, all).subtitle).toBe("Operational · Room 1 · North Campus");
    });
});

// ---------------------------------------------------------------------------
// 8 — the scope picker.
// ---------------------------------------------------------------------------
describe("8. useScopeOptions grammar", () => {
    it("resolves a nested Classroom's site instead of rendering an em dash", () => {
        expect(scopeOptionLabel(TOD1, ROWS)).toBe("Toddler 1 · North Campus");
        expect(scopeOptionLabel(TOD1, ROWS)).not.toContain("—");
    });

    it("keeps this surface's smaller name · site grammar rather than the list subtitle", () => {
        expect(scopeOptionLabel(TOD1, ROWS)).not.toContain("Room 1");
        expect(scopeOptionLabel(INFANT, ROWS)).toBe("Infant Room · North Campus");
    });

    it("degrades to the bare name rather than a dangling separator", () => {
        const orphan = row({ id: "o", label: "Floating", parent_location_id: null });
        expect(scopeOptionLabel(orphan, [orphan])).toBe("Floating");
    });
});

// ---------------------------------------------------------------------------
// Rail grammar — the site is the page, not a row.
// ---------------------------------------------------------------------------
describe("rail grammar inside one site", () => {
    it("leads with Type and the containing room, omitting the campus", () => {
        expect(roomRailTopologySegments(TOD1, ROWS)).toEqual(["Operational", "Room 1"]);
    });

    it("shows only Type for a room that hangs off the site", () => {
        expect(roomRailTopologySegments(INFANT, ROWS)).toEqual(["Operational"]);
        expect(roomRailTopologySegments(ROOM1, ROWS)).toEqual(["Physical"]);
        expect(roomRailTopologySegments(PLAY, ROWS)).toEqual(["Physical"]);
    });

    it("never repeats the campus in a row already scoped to it", () => {
        for (const r of [TOD1, ROOM1, PLAY, INFANT]) {
            expect(roomRailTopologySegments(r, ROWS)).not.toContain("North Campus");
        }
    });
});

describe("sorting context", () => {
    it("gives a nested Classroom the same sort key as its flat neighbour", () => {
        expect(roomSiteLabel(TOD1, ROWS)).toBe("North Campus");
        expect(roomSiteLabel(INFANT, ROWS)).toBe(roomSiteLabel(TOD1, ROWS));
    });
});

// ---------------------------------------------------------------------------
// 14-15 — one owner for role labels and for ancestry.
// ---------------------------------------------------------------------------
describe("14-15. no surface reimplements role labels or ancestry", () => {
    const read = (rel: string) =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../..", rel), "utf8");

    const MOUNTED = [
        "components/adminV2/settings/locations/useLocationsConfigurationSettings.ts",
        "components/adminV2/settings/configurationRuntime/useScopeOptions.ts",
        "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx",
    ];

    it("14. no mounted surface maps a role to an operator word itself", () => {
        for (const rel of MOUNTED) {
            const src = read(rel);
            expect(src).not.toMatch(/["'`]Physical room["'`]/);
            expect(src).not.toMatch(/["'`]Shared space["'`]/);
            expect(src).not.toMatch(/unit_role\s*===/);
        }
    });

    it("15. no mounted surface treats the direct parent as the site", () => {
        for (const rel of MOUNTED) {
            const src = read(rel);
            expect(src).not.toMatch(/siteLabelById\.get\(\s*\w*[Rr]oom\w*\.parent_location_id/);
            expect(src).not.toMatch(/siteLabelById\.get\(r\.parent_location_id/);
        }
    });
});
