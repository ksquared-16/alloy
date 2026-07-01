import {
    DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT,
    LANE_KEY_TO_VISUAL_CONTEXT,
    NEUTRAL_CONTEXT_KEY,
    VISUAL_CONTEXT_KEY_ALIASES,
    getRegistryEntry,
    isRegisteredVisualContextKey,
} from "./contextRegistry";
import type { OperationalVisualContext, ResolvedVisualContext, VisualContextKey } from "./types";

function normalizeKey(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t.length > 0 ? t : null;
}

/** Map explicit / stored keys to a registered semantic context key. */
function resolveCanonicalContextKey(raw: string): VisualContextKey {
    if (isRegisteredVisualContextKey(raw)) return raw;
    const mapped = VISUAL_CONTEXT_KEY_ALIASES[raw];
    if (mapped && isRegisteredVisualContextKey(mapped)) return mapped;
    return NEUTRAL_CONTEXT_KEY;
}

/**
 * Priority:
 * 1. explicit visual_context_key
 * 2. laneKey → semantic context
 * 3. workUnit.visual_context_key
 * 4. department.default_visual_context_key
 * 5. department.key → default semantic context
 * 6. neutral
 */
export function resolveVisualContextKey(input: OperationalVisualContext): VisualContextKey {
    const explicit = normalizeKey(input.visualContextKey);
    if (explicit) {
        return resolveCanonicalContextKey(explicit);
    }

    const lane = normalizeKey(input.laneKey);
    if (lane && LANE_KEY_TO_VISUAL_CONTEXT[lane]) {
        return LANE_KEY_TO_VISUAL_CONTEXT[lane];
    }

    const wu = normalizeKey(input.workUnitVisualContextKey);
    if (wu) {
        return resolveCanonicalContextKey(wu);
    }

    const deptDefault = normalizeKey(input.departmentDefaultVisualContextKey);
    if (deptDefault) {
        return resolveCanonicalContextKey(deptDefault);
    }

    const deptKey = normalizeKey(input.departmentKey);
    if (deptKey && DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT[deptKey]) {
        return DEPARTMENT_KEY_TO_DEFAULT_VISUAL_CONTEXT[deptKey];
    }

    return NEUTRAL_CONTEXT_KEY;
}

export function resolveVisualContext(input: OperationalVisualContext): ResolvedVisualContext {
    const contextKey = resolveVisualContextKey(input);
    const entry = getRegistryEntry(contextKey);
    const out: ResolvedVisualContext = {
        contextKey,
        alloyFamily: entry.alloyFamily,
    };
    if (entry.amberEmphasis) {
        out.amberEmphasis = entry.amberEmphasis;
    }
    return out;
}

/** Legacy: Alloy family from `departments.key` only (no lane / WU hints). */
export function departmentKeyToAccentFamily(
    departmentKey: string | null | undefined
): import("./types").AlloyVisualFamily {
    return resolveVisualContext({ departmentKey }).alloyFamily;
}
