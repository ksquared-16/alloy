/**
 * Resolve child display name for placement candidate queue projection.
 * Mirrors inquiry drawer identity: persons canonical when linked, not stale demo placeholders.
 */

export type PlacementChildNameMemberSource = {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    metadata?: Record<string, unknown> | null;
    persons?: {
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
    } | null;
};

const PLACEHOLDER_CHILD_NAMES = new Set(["child", "unknown", "unknown child", "unnamed", "unnamed child"]);

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    return s || null;
}

export function isPlaceholderChildDisplayName(name: string | null | undefined): boolean {
    const n = trimOrNull(name);
    if (!n) return true;
    return PLACEHOLDER_CHILD_NAMES.has(n.toLowerCase());
}

export function personDisplayNameFromParts(
    person: PlacementChildNameMemberSource["persons"] | null | undefined
): string | null {
    if (!person) return null;
    const full = trimOrNull(person.full_name);
    if (full && !isPlaceholderChildDisplayName(full)) return full;
    const joined = [trimOrNull(person.first_name), trimOrNull(person.last_name)].filter(Boolean).join(" ").trim();
    return joined && !isPlaceholderChildDisplayName(joined) ? joined : null;
}

function memberJoinedName(member: PlacementChildNameMemberSource | null | undefined): string | null {
    if (!member) return null;
    const joined = [trimOrNull(member.first_name), trimOrNull(member.last_name)].filter(Boolean).join(" ").trim();
    return joined && !isPlaceholderChildDisplayName(joined) ? joined : null;
}

function metadataDisplayName(meta: Record<string, unknown> | null | undefined): string | null {
    if (!meta) return null;
    const raw = meta.display_name ?? meta.child_display_name ?? meta.demo_child_name;
    const name = trimOrNull(raw);
    return name && !isPlaceholderChildDisplayName(name) ? name : null;
}

function resolveFromMember(member: PlacementChildNameMemberSource | null | undefined): string | null {
    if (!member) return null;
    return (
        personDisplayNameFromParts(member.persons) ??
        (trimOrNull(member.display_name) && !isPlaceholderChildDisplayName(member.display_name)
            ? trimOrNull(member.display_name)
            : null) ??
        memberJoinedName(member) ??
        metadataDisplayName(member.metadata ?? null)
    );
}

/** Prefer OCM-linked member, then candidate member, then candidate metadata. */
export function resolvePlacementCandidateChildDisplayName(input: {
    ocmMember?: PlacementChildNameMemberSource | null;
    candidateMember?: PlacementChildNameMemberSource | null;
    candidateMetadata?: Record<string, unknown> | null;
}): string | null {
    return (
        resolveFromMember(input.ocmMember) ??
        resolveFromMember(input.candidateMember) ??
        metadataDisplayName(input.candidateMetadata)
    );
}

/** Queue row label — never surfaces demo placeholder `Child` for real candidates. */
export function resolvePlacementWaitlistChildDisplayLabel(input: {
    childDisplayName?: string | null;
    isSyntheticFallback?: boolean;
}): string {
    const raw = trimOrNull(input.childDisplayName);
    const name = raw && !isPlaceholderChildDisplayName(raw) ? raw : null;
    if (name) return name;
    if (input.isSyntheticFallback) return "Child";
    return "Waitlisted child";
}

export type PlacementCandidateProjectionMismatch = {
    child_name_mismatch: boolean;
    cohort_mismatch: boolean;
    site_mismatch: boolean;
    resolved_child_display_name: string | null;
    candidate_child_display_name: string | null;
    ocm_child_display_name: string | null;
};

export function detectPlacementCandidateProjectionMismatch(input: {
    candidateStoredCohortKey?: string | null;
    ocmCohortKey?: string | null;
    resolvedCohortKey?: string | null;
    candidateSiteId?: string | null;
    ocmLocationId?: string | null;
    candidateMember?: PlacementChildNameMemberSource | null;
    ocmMember?: PlacementChildNameMemberSource | null;
    candidateMetadata?: Record<string, unknown> | null;
}): PlacementCandidateProjectionMismatch {
    const resolvedName = resolvePlacementCandidateChildDisplayName({
        ocmMember: input.ocmMember,
        candidateMember: input.candidateMember,
        candidateMetadata: input.candidateMetadata,
    });
    const ocmName = resolveFromMember(input.ocmMember);
    const candidateName =
        resolveFromMember(input.candidateMember) ?? metadataDisplayName(input.candidateMetadata);

    const storedCohort = trimOrNull(input.candidateStoredCohortKey);
    const ocmCohort = trimOrNull(input.ocmCohortKey);
    const resolvedCohort = trimOrNull(input.resolvedCohortKey);
    const ocmSite = trimOrNull(input.ocmLocationId);
    const candSite = trimOrNull(input.candidateSiteId);

    return {
        child_name_mismatch: Boolean(
            resolvedName &&
                candidateName &&
                resolvedName.toLowerCase() !== candidateName.toLowerCase()
        ),
        cohort_mismatch: Boolean(
            ocmCohort && storedCohort && storedCohort !== ocmCohort && resolvedCohort === ocmCohort
        ),
        site_mismatch: Boolean(ocmSite && candSite && candSite !== ocmSite),
        resolved_child_display_name: resolvedName,
        candidate_child_display_name: candidateName,
        ocm_child_display_name: ocmName,
    };
}
