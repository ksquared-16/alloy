/**
 * Role/profile-aware filtering for `persons.status_key` dropdown options.
 * Storage stays on `persons.status_key`; applicability lives in status_definitions.metadata.
 */

export const PERSON_STATUS_PROFILE_CHILD_LIFECYCLE = "child_lifecycle" as const;
export const PERSON_STATUS_PROFILE_GENERIC = "person_generic" as const;

export type PersonStatusProfileKey =
    | typeof PERSON_STATUS_PROFILE_CHILD_LIFECYCLE
    | typeof PERSON_STATUS_PROFILE_GENERIC;

/** Canonical child lifecycle keys seeded for person drawer. */
export const PERSON_CHILD_LIFECYCLE_STATUS_KEYS = [
    "active",
    "future_start",
    "withdrawn",
    "graduated",
    "inactive",
    "archived",
] as const;

/** Child-only lifecycle keys — hidden from parent/guardian person drawers. */
export const PERSON_CHILD_ONLY_STATUS_KEYS = new Set<string>([
    "future_start",
    "withdrawn",
    "graduated",
]);

/** Generic person keys shared by child and parent/guardian profiles. */
export const PERSON_GENERIC_STATUS_KEYS = new Set<string>(["active", "inactive", "archived"]);

export type PersonStatusApplicabilityRow = {
    status_key: string;
    metadata?: Record<string, unknown> | null;
};

const ALL_PERSON_STATUS_PROFILES: PersonStatusProfileKey[] = [
    PERSON_STATUS_PROFILE_CHILD_LIFECYCLE,
    PERSON_STATUS_PROFILE_GENERIC,
];

function normalizeProfileToken(raw: unknown): string | null {
    const t = String(raw ?? "").trim().toLowerCase();
    if (!t) return null;
    if (t === "child" || t === "children") return PERSON_STATUS_PROFILE_CHILD_LIFECYCLE;
    if (t === "parent" || t === "guardian" || t === "parent_guardian") {
        return PERSON_STATUS_PROFILE_GENERIC;
    }
    if (t === "employee") return PERSON_STATUS_PROFILE_GENERIC;
    if (t === PERSON_STATUS_PROFILE_CHILD_LIFECYCLE || t === PERSON_STATUS_PROFILE_GENERIC) return t;
    return t;
}

function readMetadataProfiles(metadata: Record<string, unknown> | null | undefined): string[] {
    const profilesRaw = metadata?.applies_to_profiles;
    const rolesRaw = metadata?.applies_to_roles;
    const out = new Set<string>();

    if (Array.isArray(profilesRaw)) {
        for (const p of profilesRaw) {
            const n = normalizeProfileToken(p);
            if (n) out.add(n);
        }
    }
    if (Array.isArray(rolesRaw)) {
        for (const r of rolesRaw) {
            const n = normalizeProfileToken(r);
            if (n) out.add(n);
        }
    }
    return Array.from(out);
}

/** Resolved profile list for a status row — metadata wins; known keys provide fallback. */
export function resolvePersonStatusApplicabilityProfiles(
    row: PersonStatusApplicabilityRow
): PersonStatusProfileKey[] {
    const fromMeta = readMetadataProfiles(row.metadata ?? null);
    if (fromMeta.length > 0) {
        return fromMeta.filter((p): p is PersonStatusProfileKey =>
            ALL_PERSON_STATUS_PROFILES.includes(p as PersonStatusProfileKey)
        );
    }

    const key = String(row.status_key ?? "").trim().toLowerCase();
    if (PERSON_CHILD_ONLY_STATUS_KEYS.has(key)) {
        return [PERSON_STATUS_PROFILE_CHILD_LIFECYCLE];
    }
    if (PERSON_GENERIC_STATUS_KEYS.has(key) || PERSON_CHILD_LIFECYCLE_STATUS_KEYS.includes(key as (typeof PERSON_CHILD_LIFECYCLE_STATUS_KEYS)[number])) {
        return [...ALL_PERSON_STATUS_PROFILES];
    }
    return [...ALL_PERSON_STATUS_PROFILES];
}

export function personStatusAppliesToProfile(
    row: PersonStatusApplicabilityRow,
    profile: PersonStatusProfileKey | string
): boolean {
    const target = normalizeProfileToken(profile);
    if (!target) return false;
    const profiles = resolvePersonStatusApplicabilityProfiles(row);
    return profiles.includes(target as PersonStatusProfileKey);
}

export function filterPersonStatusDefinitionsForProfile<T extends PersonStatusApplicabilityRow>(
    rows: T[],
    profile: PersonStatusProfileKey | string
): T[] {
    return rows.filter((row) => personStatusAppliesToProfile(row, profile));
}

export type PersonStatusOptionRow = {
    status_key: string;
    status_label?: string | null;
    sort_order?: number;
    is_active?: boolean;
    metadata?: Record<string, unknown> | null;
    legacy?: boolean;
};

/** Keep current persisted key visible when it falls outside the filtered profile set. */
export function appendLegacyPersonStatusOption<T extends PersonStatusOptionRow>(
    options: T[],
    currentStatus: string | null | undefined,
    statusDisplayLabel: string | null | undefined
): T[] {
    const sk = String(currentStatus ?? "").trim();
    if (!sk || options.some((o) => o.status_key === sk)) return options;
    const label = String(statusDisplayLabel ?? sk).trim() || sk;
    return [
        ...options,
        {
            status_key: sk,
            status_label: `${label} (legacy)`,
            sort_order: 9999,
            is_active: true,
            legacy: true,
        } as T,
    ];
}

export function buildPersonStatusApplicabilityMetadata(
    mode: "child_lifecycle" | "person_generic" | "both"
): Record<string, unknown> {
    if (mode === "child_lifecycle") {
        return {
            applies_to_profiles: [PERSON_STATUS_PROFILE_CHILD_LIFECYCLE],
            applies_to_roles: ["child"],
        };
    }
    if (mode === "person_generic") {
        return {
            applies_to_profiles: [PERSON_STATUS_PROFILE_GENERIC],
            applies_to_roles: ["parent", "guardian", "employee"],
        };
    }
    return {
        applies_to_profiles: [...ALL_PERSON_STATUS_PROFILES],
        applies_to_roles: ["child", "parent", "guardian", "employee"],
    };
}

export function formatPersonStatusApplicabilityLabel(
    metadata: Record<string, unknown> | null | undefined,
    statusKey?: string
): string {
    const profiles = resolvePersonStatusApplicabilityProfiles({
        status_key: statusKey ?? "",
        metadata,
    });
    const hasChild = profiles.includes(PERSON_STATUS_PROFILE_CHILD_LIFECYCLE);
    const hasGeneric = profiles.includes(PERSON_STATUS_PROFILE_GENERIC);
    if (hasChild && hasGeneric) return "Child + all people";
    if (hasChild) return "Child lifecycle";
    if (hasGeneric) return "All people";
    return "All people";
}

export type PersonDrawerStatusProfileInput = {
    profiles: string[];
    display: string;
};

/** Map resolved person drawer profile to status dropdown filter profile, if any. */
export function resolvePersonDrawerStatusProfile(
    profile: PersonDrawerStatusProfileInput | null | undefined,
    options?: { childChrome?: boolean }
): PersonStatusProfileKey | null {
    if (options?.childChrome || profile?.profiles.includes("child")) {
        return PERSON_STATUS_PROFILE_CHILD_LIFECYCLE;
    }
    if (!profile) return null;
    if (
        profile.profiles.includes("parent") ||
        profile.profiles.includes("guardian") ||
        profile.profiles.includes("employee")
    ) {
        return PERSON_STATUS_PROFILE_GENERIC;
    }
    return null;
}
