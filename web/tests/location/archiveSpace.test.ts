/**
 * The Space archive lifecycle.
 *
 * Three states have to stay distinct, and the interesting failures are all the
 * ways archive could quietly become a second spelling of "inactive" or a first
 * spelling of "delete".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    currentConfigurationSpaces,
    decideSpaceArchive,
    isArchivedSpace,
    SPACE_ARCHIVE_REFUSAL_COPY,
    type SpaceArchiveDependencies,
} from "@/lib/locations/archiveSpace";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const NONE: SpaceArchiveDependencies = {
    activeChildSpaces: 0,
    currentOrFuturePlacements: 0,
    currentOrFutureAssignments: 0,
    currentOrFutureCoverage: 0,
};
const decide = (over: Partial<SpaceArchiveDependencies> = {}, flags = {}) =>
    decideSpaceArchive({ exists: true, alreadyArchived: false, dependencies: { ...NONE, ...over }, ...flags });

describe("active, inactive and archived are three different things", () => {
    it("an inactive space is still part of configuration", () => {
        const rows = [{ id: "a", is_active: false, archived_at: null }];
        expect(currentConfigurationSpaces(rows)).toHaveLength(1);
        expect(isArchivedSpace(rows[0])).toBe(false);
    });

    it("an archived space is not, however active it looks", () => {
        const rows = [{ id: "a", is_active: true, archived_at: "2026-09-23T00:00:00Z" }];
        expect(currentConfigurationSpaces(rows)).toHaveLength(0);
        expect(isArchivedSpace(rows[0])).toBe(true);
    });

    it("archiving does not touch is_active, so a paused space stays paused in the record", () => {
        const service = read("lib/locations/archiveSpaceService.ts");
        const update = service.slice(service.indexOf(".update({"), service.indexOf(".update({") + 200);
        expect(update).toContain("archived_at");
        expect(update).not.toContain("is_active");
    });
});

describe("what refuses, and why", () => {
    it("a space with nothing current archives", () => {
        expect(decide()).toEqual({ ok: true });
    });

    it("a physical space still holding spaces refuses, rather than orphaning them", () => {
        const d = decide({ activeChildSpaces: 2 });
        expect(d).toMatchObject({ ok: false, code: "space_contains_active_spaces" });
    });

    it("current or future placements refuse", () => {
        expect(decide({ currentOrFuturePlacements: 1 })).toMatchObject({
            ok: false,
            code: "space_has_current_placements",
        });
    });

    it("current or future assignments refuse", () => {
        expect(decide({ currentOrFutureAssignments: 1 })).toMatchObject({
            ok: false,
            code: "space_has_current_assignments",
        });
    });

    it("planned coverage refuses", () => {
        expect(decide({ currentOrFutureCoverage: 1 })).toMatchObject({
            ok: false,
            code: "space_has_current_coverage",
        });
    });

    it("a missing or already-archived space refuses by name", () => {
        expect(
            decideSpaceArchive({ exists: false, alreadyArchived: false, dependencies: NONE }),
        ).toMatchObject({ code: "space_not_found" });
        expect(
            decideSpaceArchive({ exists: true, alreadyArchived: true, dependencies: NONE }),
        ).toMatchObject({ code: "already_archived" });
    });

    it("every refusal carries operator copy, never a bare code", () => {
        for (const [code, copy] of Object.entries(SPACE_ARCHIVE_REFUSAL_COPY)) {
            expect(copy.length).toBeGreaterThan(20);
            expect(copy).not.toContain(code);
            expect(copy).not.toContain("_");
        }
    });

    it("containment is reported first, because it is the one the operator can fix here", () => {
        const d = decide({ activeChildSpaces: 1, currentOrFuturePlacements: 5 });
        expect(d).toMatchObject({ code: "space_contains_active_spaces" });
    });
});

describe("history is the thing archive protects", () => {
    it("asks about the future, not about whether the space was ever used", () => {
        const service = read("lib/locations/archiveSpaceService.ts");
        // A row with no end date is current; a dated one only counts while its
        // end is still ahead of today. Nothing counts rows that already ended.
        expect(service).toContain("end_date");
        expect(service).toContain("todayYmd");
        expect(service).toContain("is.null");
    });

    it("never deletes a row", () => {
        const service = read("lib/locations/archiveSpaceService.ts");
        expect(service).not.toContain(".delete(");
        expect(service).not.toContain("DELETE");
    });

    it("keeps single-id reads unfiltered, so a historical room still resolves its label", () => {
        const provider = read("lib/location/canonicalLocationProvider.ts");
        const byId = provider.slice(provider.indexOf("export async function resolveLocationById"));
        const firstQuery = byId.slice(0, byId.indexOf("maybeSingle()"));
        expect(firstQuery).not.toContain("archived_at");
    });
});

describe("archived leaves every collection at once", () => {
    it("the canonical provider filters collections", () => {
        const provider = read("lib/location/canonicalLocationProvider.ts");
        expect(provider).toContain('query = query.is("archived_at", null)');
        expect(provider).toContain("archived_at, is_primary");
    });

    it("the admin locations list filters too, and offers no opt-in", () => {
        const route = read("app/api/admin/locations/route.ts");
        expect(route).toContain('q.is("archived_at", null)');
        // includeInactive means "show the paused ones", which is a different
        // question from "show the ones I retired".
        const block = route.slice(route.indexOf('q = q.is("archived_at", null)') - 400);
        expect(block.slice(0, 460)).not.toContain("includeArchived");
    });

    it("archive is its own route, not a PATCH field anyone could set", () => {
        const patch = read("app/api/admin/locations/[id]/route.ts");
        // The generic PATCH allow-list must not carry it, or the safety
        // evaluation could be skipped entirely.
        const allowList = patch.slice(0, patch.indexOf("] as const;"));
        expect(allowList).not.toContain("archived_at");
        expect(read("app/api/admin/locations/[id]/archive/route.ts")).toContain("export async function POST");
    });

    it("is stored as a first-class column, never as metadata", () => {
        const migration = read("../supabase/migrations/20261016120000_locations_archived_at.sql");
        expect(migration).toContain("ADD COLUMN IF NOT EXISTS archived_at timestamptz");
        const service = read("lib/locations/archiveSpaceService.ts");
        expect(service).not.toContain("metadata");
    });
});

describe("the operator is told what archive means", () => {
    it("the confirmation distinguishes archive from inactive and promises history", () => {
        const panel = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        const confirm = panel.slice(panel.indexOf("locations-room-archive-confirm"));
        const block = confirm.slice(0, 1600);
        expect(block).toContain("Inactive");
        expect(block).toContain("attendance");
        // Not called Delete, because the record is kept.
        expect(block).not.toContain("Delete");
    });
});
