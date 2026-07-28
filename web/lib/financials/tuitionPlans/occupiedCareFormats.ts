/**
 * Care formats already used by another Tuition Plan in the same program
 * (program_offerings_unique on org_id, program_key, attendance_type).
 */

import type { AttendanceType } from "@/lib/programs/programOfferings";
import type { ProgramOffering } from "@/lib/programs/programOfferings";

export function occupiedCareFormatsForProgram(
    offerings: ProgramOffering[],
    programKey: string,
    excludeOfferingId?: string | null,
): Set<AttendanceType> {
    const occupied = new Set<AttendanceType>();
    const key = programKey.trim();
    if (!key) return occupied;
    for (const offering of offerings) {
        if (offering.program_key !== key) continue;
        if (excludeOfferingId && offering.id === excludeOfferingId) continue;
        occupied.add(offering.attendance_type);
    }
    return occupied;
}
