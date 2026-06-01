/**
 * Platform process types (lifecycle instances). Enrollment is the first shipped type.
 */

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
        settingsPath: "/adminV2/settings/enrollment-process",
        title: "Enrollment Process",
        subtitle: "Configure how families move from lead to enrolled.",
    },
] as const;

export function lifecycleProcessType(key: LifecycleProcessKey): LifecycleProcessTypeDefinition {
    const found = LIFECYCLE_PROCESS_TYPES.find((p) => p.key === key);
    if (!found) throw new Error(`Unknown lifecycle process: ${key}`);
    return found;
}
