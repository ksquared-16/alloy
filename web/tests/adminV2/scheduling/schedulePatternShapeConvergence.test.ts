import { describe, expect, it } from "vitest";
import { mapRawPattern } from "@/components/adminV2/operations/OperationsStudio";
import type { SchedulePatternRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";

/**
 * Proves Patterns Studio and Locations → Schedule stay converged on one
 * `schedule_patterns` table/API. Both surfaces hit `/api/admin/schedule-patterns`
 * (Locations via `fetchSchedulePatternsForSite` / `createSchedulePattern` in
 * `lib/childcareOperational/fetchOperationalEnrollment.ts`; Studio via
 * `SchedulingWorkspace.tsx`'s `patternApi`) and therefore receive identical
 * `SchedulePatternRow` rows. This test feeds Studio's row→view mapper
 * (`mapRawPattern`) the exact row shape Locations' typed client uses, so a
 * future divergence in either surface's expected shape fails loudly here
 * instead of silently in the UI.
 */
describe("schedule pattern shape convergence (Studio ↔ Locations)", () => {
    const row: SchedulePatternRow = {
        id: "pat-1",
        org_id: "org-1",
        site_location_id: "site-1",
        key: "full_day_mwf",
        label: "Full day · Mon/Wed/Fri",
        schedule_type_key: "weekly",
        weekdays: [1, 3, 5],
        sort_order: 100,
        is_active: true,
        metadata: {
            hours: { opens_at: "08:30", closes_at: "17:30" },
            per_day_enabled: false,
            default_days: [1, 3],
            applicable_program_keys: ["toddler"],
        },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
    };

    it("maps a Locations-shaped SchedulePatternRow into the Studio pattern view model", () => {
        const studioPattern = mapRawPattern(row);
        expect(studioPattern).toEqual({
            id: "pat-1",
            key: "full_day_mwf",
            label: "Full day · Mon/Wed/Fri",
            scheduleTypeKey: "weekly",
            weekdays: [1, 3, 5],
            isActive: true,
            sortOrder: 100,
            metadata: row.metadata,
            hours: { arrive: "08:30", depart: "17:30" },
            perDayEnabled: false,
            defaultDays: [1, 3],
            programKeys: ["toddler"],
        });
    });

    it("tolerates rows with no v3 metadata yet (falls back sensibly, same as Locations reads)", () => {
        const bare: SchedulePatternRow = {
            ...row,
            id: "pat-2",
            metadata: {},
        };
        const studioPattern = mapRawPattern(bare);
        expect(studioPattern.hours).toBeNull();
        expect(studioPattern.perDayEnabled).toBe(false);
        expect(studioPattern.defaultDays).toEqual(bare.weekdays);
        expect(studioPattern.programKeys).toEqual([]);
    });

    it("archived rows (is_active: false) surface as inactive, matching Locations' is_active column", () => {
        const archived: SchedulePatternRow = { ...row, id: "pat-3", is_active: false };
        expect(mapRawPattern(archived).isActive).toBe(false);
    });
});
