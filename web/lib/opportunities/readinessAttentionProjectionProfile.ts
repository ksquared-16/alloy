/**
 * Needs Attention V2 Phase 1 — readiness → attention projection policy (metadata only).
 * @see docs/sprints/06_2026/needs_attention_v2_phase_0_implementation_plan.md
 */

export type ReadinessAttentionProjectionProfileV1 = {
    version: 1;
    /** Master switch for readiness-sourced attention reasons. Default true when subtree present. */
    enabled: boolean;
    /** When true, enforced readiness gaps project to `missing_required_info`. Default true. */
    flag_missing_required: boolean;
    /** When true, required (non-enforced) gaps also project. Default false. */
    include_required_gaps: boolean;
    /**
     * When true, recommended-only gaps project. Default false.
     * Product policy: recommended guidance stays on Readiness surfaces — leave false in production.
     */
    include_recommended_gaps: boolean;
    /**
     * When true, queue / NA list paths evaluate readiness per row (higher cost).
     * Drawer entity attach always evaluates when profile.enabled.
     */
    readiness_attention_bridge_v1: boolean;
};

export const DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1: ReadinessAttentionProjectionProfileV1 = {
    version: 1,
    enabled: true,
    flag_missing_required: true,
    include_required_gaps: false,
    include_recommended_gaps: false,
    readiness_attention_bridge_v1: false,
};

function parseBool(raw: unknown, fallback: boolean): boolean {
    return typeof raw === "boolean" ? raw : fallback;
}

/**
 * Read `metadata.opportunity_attention_rules.readiness_projection_v1`.
 * When the subtree is absent, returns defaults (enforced-only projection; queue bridge off).
 */
export function resolveReadinessAttentionProjectionProfileFromMetadata(
    metadata: unknown
): ReadinessAttentionProjectionProfileV1 {
    const root =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? ((metadata as Record<string, unknown>).opportunity_attention_rules as Record<string, unknown> | undefined)
            : undefined;
    if (!root || typeof root !== "object" || Array.isArray(root)) {
        return { ...DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1 };
    }
    const raw = root.readiness_projection_v1;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
        return { ...DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1 };
    }
    const o = raw as Record<string, unknown>;
    if (o.version !== 1) {
        return { ...DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1 };
    }
    return {
        version: 1,
        enabled: parseBool(o.enabled, true),
        flag_missing_required: parseBool(o.flag_missing_required, true),
        include_required_gaps: parseBool(o.include_required_gaps, false),
        include_recommended_gaps: parseBool(o.include_recommended_gaps, false),
        readiness_attention_bridge_v1: parseBool(o.readiness_attention_bridge_v1, false),
    };
}

export function isReadinessAttentionProjectionActive(
    profile: ReadinessAttentionProjectionProfileV1
): boolean {
    return profile.enabled && profile.flag_missing_required;
}
