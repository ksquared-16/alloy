import { validatePlacementProfile } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import type {
    MergedPlacementPriorityConfig,
    PlacementPriorityParseIssue,
} from "@/lib/orchestration/placement/placementConfigSchema";
import {
    mergePlacementPriorityLayers,
    parsePlacementPriorityLayerStrict,
} from "@/lib/orchestration/placement/placementConfigSchema";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    applyPlacementPriorityEffectiveProfile,
    effectivePriorityRuleEnabledSet,
    validatePriorityRuleEnabledKeysForProfile,
    validatePriorityRuleOrderForProfile,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";

export type PlacementQueueEvaluationOptions = {
    shadow_mode: boolean;
    evaluation_cap: number;
    /** Applied when merging into evaluator input profile (`strict_required_facts`). */
    strict_required_facts: boolean;
    display: MergedPlacementPriorityConfig["display"];
    /** Registry preset revision vs config pin (informational). */
    profile_revision_mismatch: boolean;
};

export type ResolvedPlacementQueueConfig =
    | {
          status: "disabled";
          queue_key: string;
          reason: string;
      }
    | {
          status: "enabled";
          queue_key: string;
          engine_version: "v1" | "v2";
          profile: PlacementProfile;
          merged: MergedPlacementPriorityConfig;
          options: PlacementQueueEvaluationOptions;
      };

export type ResolvePlacementQueueConfigParams = {
    departmentMetadata: unknown;
    workUnitMetadata: unknown;
    queue_key: string;
};

/**
 * Resolve whether placement evaluation applies to this queue lane — **pure**, no I/O.
 * Future QueueService calls this after loading work unit + department metadata.
 */
export function resolvePlacementQueueConfig(params: ResolvePlacementQueueConfigParams): ResolvedPlacementQueueConfig {
    const qk = params.queue_key.trim();
    const merged = mergePlacementPriorityLayers(params.departmentMetadata, params.workUnitMetadata);

    if (!merged.enabled) {
        return { status: "disabled", queue_key: qk, reason: "placement_priority_v1.enabled is false or omitted" };
    }

    if (!merged.profile_id?.trim()) {
        return { status: "disabled", queue_key: qk, reason: "profile_id missing while enabled" };
    }

    if (merged.queue_keys_enabled?.length && !merged.queue_keys_enabled.includes(qk)) {
        return {
            status: "disabled",
            queue_key: qk,
            reason: `queue_key not in queue_keys_enabled`,
        };
    }

    const engineVersion = merged.engine_version === "v2" ? "v2" : "v1";

    const profile = getPlacementProfileFromRegistry(merged.profile_id.trim());
    if (!profile) {
        return {
            status: "disabled",
            queue_key: qk,
            reason: `unknown profile_id: ${merged.profile_id}`,
        };
    }

    if (engineVersion === "v2" && !merged.profile_id.trim().endsWith("_v2")) {
        return {
            status: "disabled",
            queue_key: qk,
            reason: `engine_version v2 requires a v2 preset profile_id (got ${merged.profile_id})`,
        };
    }

    const pin = merged.profile_revision?.trim();
    const profile_revision_mismatch = Boolean(pin && pin !== profile.revision);

    const strictFromBehavior =
        merged.missing_fact_behavior === "strict"
            ? true
            : merged.missing_fact_behavior === "soft"
              ? false
              : profile.strict_required_facts === true;

    let profileForEval: PlacementProfile = {
        ...profile,
        strict_required_facts: strictFromBehavior,
    };

    const ord = merged.priority_rule_order;
    if (ord?.length) {
        const ro = validatePriorityRuleOrderForProfile(profileForEval, ord);
        if (!ro.ok) {
            return { status: "disabled", queue_key: qk, reason: ro.error };
        }
        const en = validatePriorityRuleEnabledKeysForProfile(
            profileForEval,
            ord,
            effectivePriorityRuleEnabledSet(ord, merged.priority_rule_enabled_keys, profileForEval.fallback_bucket_key)
        );
        if (!en.ok) {
            return { status: "disabled", queue_key: qk, reason: en.error };
        }
        try {
            profileForEval = applyPlacementPriorityEffectiveProfile(profileForEval, ord, merged.priority_rule_enabled_keys);
        } catch (e) {
            const msg = e instanceof Error && e.message ? e.message : "placement priority rule config invalid";
            return { status: "disabled", queue_key: qk, reason: msg };
        }
        profileForEval = { ...profileForEval, strict_required_facts: strictFromBehavior };
    }

    const inv = validatePlacementProfile(profileForEval);
    if (inv) {
        return {
            status: "disabled",
            queue_key: qk,
            reason: inv.message,
        };
    }

    return {
        status: "enabled",
        queue_key: qk,
        engine_version: engineVersion,
        profile: profileForEval,
        merged,
        options: {
            shadow_mode: merged.shadow_mode,
            evaluation_cap: merged.evaluation_cap,
            strict_required_facts: strictFromBehavior,
            display: merged.display,
            profile_revision_mismatch,
        },
    };
}

/** Validate both metadata layers independently (admin save UX). */
export function validatePlacementMetadataLayers(params: {
    departmentMetadata: unknown;
    workUnitMetadata: unknown;
}): { ok: true } | { ok: false; layer: "department" | "work_unit"; issues: PlacementPriorityParseIssue[] } {
    const d = parsePlacementPriorityLayerStrict(params.departmentMetadata);
    if (!d.ok) return { ok: false, layer: "department", issues: d.issues };
    const w = parsePlacementPriorityLayerStrict(params.workUnitMetadata);
    if (!w.ok) return { ok: false, layer: "work_unit", issues: w.issues };
    return { ok: true };
}
