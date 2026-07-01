import { ADMIN_V2_SETTINGS_LIFECYCLE_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";

export const ENROLLMENT_PROCESS_KEY = "enrollment" as const;

export type LifecycleProcessKey = typeof ENROLLMENT_PROCESS_KEY;

export type LifecycleProcessTypeDefinition = {
    key: LifecycleProcessKey;
    /** Settings route segment */
    settingsPath: string;
    title: string;
    subtitle: string;
};

export const LIFECYCLE_PROCESS_TYPES: readonly LifecycleProcessTypeDefinition[] = [
    {
        key: ENROLLMENT_PROCESS_KEY,
        settingsPath: ADMIN_V2_SETTINGS_LIFECYCLE_PATH,
        title: "Enrollment",
        subtitle: "Lead to enrolled — the default lifecycle example.",
    },
] as const;

export function lifecycleProcessType(key: LifecycleProcessKey): LifecycleProcessTypeDefinition {
    const found = LIFECYCLE_PROCESS_TYPES.find((p) => p.key === key);
    if (!found) throw new Error(`Unknown lifecycle process: ${key}`);
    return found;
}
