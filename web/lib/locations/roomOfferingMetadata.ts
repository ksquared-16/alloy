/**
 * Room metadata helpers for Programs supported + Schedule Pattern reference.
 */

export function readRoomSupportedProgramKeys(metadata: Record<string, unknown> | null | undefined): string[] {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    if (Array.isArray(record.supported_program_keys)) {
        return [...new Set(record.supported_program_keys.map((value) => String(value ?? "").trim()).filter(Boolean))];
    }
    const legacy = String(record.category ?? "").trim();
    return legacy ? [legacy] : [];
}

export function readRoomSchedulePatternId(metadata: Record<string, unknown> | null | undefined): string | null {
    const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    const value = String(record.schedule_pattern_id ?? "").trim();
    return value || null;
}

export function writeRoomProgramsAndScheduleMetadata(input: {
    existing?: Record<string, unknown> | null;
    supportedProgramKeys: readonly string[];
    schedulePatternId: string | null;
    capacity?: string | null;
}): Record<string, unknown> {
    const base =
        input.existing != null && typeof input.existing === "object" && !Array.isArray(input.existing) ?
            { ...input.existing }
        :   {};
    const keys = [...new Set(input.supportedProgramKeys.map((value) => value.trim()).filter(Boolean))];
    base.supported_program_keys = keys;
    // Backward compatibility for consumers that still read a single category.
    if (keys[0]) base.category = keys[0];
    else delete base.category;
    if (input.schedulePatternId?.trim()) base.schedule_pattern_id = input.schedulePatternId.trim();
    else delete base.schedule_pattern_id;
    if (input.capacity != null) {
        const capacity = String(input.capacity).trim();
        if (capacity) base.capacity = capacity;
        else delete base.capacity;
    }
    return base;
}
