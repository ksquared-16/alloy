/**
 * Configuration Continuity — selected-object restoration (Checkpoint A).
 *
 * Owns Organization-scoped selection hints in sessionStorage so soft-nav
 * return visits can restore Location / Program selection without a full remount
 * inventing new URL ownership. URL remains authoritative when present.
 */

const STORAGE_PREFIX = "alloy:config-continuity:v1";

export type ConfigurationSelectionSnapshot = {
    orgId: string;
    locationId: string | null;
    locationTab: string | null;
    locationItemId: string | null;
    programId: string | null;
    programSection: string | null;
    /** Sibling Commercial chapter under /organization/programs?chapter=… */
    programsChapter: string | null;
    updatedAtMs: number;
};

function storageKey(orgId: string): string {
    return `${STORAGE_PREFIX}:${orgId}`;
}

function emptySnapshot(orgId: string): ConfigurationSelectionSnapshot {
    return {
        orgId,
        locationId: null,
        locationTab: null,
        locationItemId: null,
        programId: null,
        programSection: null,
        programsChapter: null,
        updatedAtMs: Date.now(),
    };
}

export function readConfigurationSelection(orgId: string): ConfigurationSelectionSnapshot | null {
    const id = orgId.trim();
    if (!id || typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(storageKey(id));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<ConfigurationSelectionSnapshot>;
        if (!parsed || parsed.orgId !== id) return null;
        return {
            ...emptySnapshot(id),
            ...parsed,
            orgId: id,
            programsChapter: parsed.programsChapter ?? null,
            updatedAtMs: typeof parsed.updatedAtMs === "number" ? parsed.updatedAtMs : Date.now(),
        };
    } catch {
        return null;
    }
}

export function writeConfigurationSelection(
    orgId: string,
    patch: Partial<Omit<ConfigurationSelectionSnapshot, "orgId" | "updatedAtMs">>,
): ConfigurationSelectionSnapshot | null {
    const id = orgId.trim();
    if (!id || typeof window === "undefined") return null;
    const prev = readConfigurationSelection(id) ?? emptySnapshot(id);
    const next: ConfigurationSelectionSnapshot = {
        ...prev,
        ...patch,
        orgId: id,
        updatedAtMs: Date.now(),
    };
    try {
        window.sessionStorage.setItem(storageKey(id), JSON.stringify(next));
    } catch {
        /* quota / private mode — continuity degrades gracefully */
    }
    return next;
}

export function clearConfigurationSelection(orgId: string): void {
    const id = orgId.trim();
    if (!id || typeof window === "undefined") return;
    try {
        window.sessionStorage.removeItem(storageKey(id));
    } catch {
        /* ignore */
    }
}

/** Test-only — clears all v1 continuity keys for the current origin. */
export function clearAllConfigurationSelectionForTests(): void {
    if (typeof window === "undefined") return;
    try {
        const keys: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
        }
        for (const key of keys) window.sessionStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}
