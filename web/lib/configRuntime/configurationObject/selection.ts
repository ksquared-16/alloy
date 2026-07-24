/**
 * Configuration Object selection precedence (Checkpoint C.5).
 *
 * Mirrors Locations Continuity doctrine without inventing a first-item default:
 *   1. valid route/query objectId
 *   2. valid retained Continuity selection
 *   3. no selection (collection landing)
 */

import type {
    ConfigurationObjectSelectionResolution,
} from "@/lib/configRuntime/configurationObject/types";

export function resolveConfigurationObjectSelection(args: {
    routeObjectId: string | null | undefined;
    retainedObjectId: string | null | undefined;
    validObjectIds: ReadonlySet<string> | readonly string[];
    allowRetainedRestore?: boolean;
    missingLabel?: string;
}): ConfigurationObjectSelectionResolution {
    const routeId = String(args.routeObjectId ?? "").trim() || null;
    const retainedId = String(args.retainedObjectId ?? "").trim() || null;
    const allowRetained = args.allowRetainedRestore !== false;
    const valid =
        args.validObjectIds instanceof Set ?
            args.validObjectIds
        :   new Set(Array.from(args.validObjectIds, (id) => String(id)));
    const missing = args.missingLabel ?? "Object not found or unavailable.";

    if (routeId) {
        if (valid.has(routeId)) {
            return {
                objectId: routeId,
                source: "route",
                error: null,
                shouldSyncRoute: false,
            };
        }
        return {
            objectId: null,
            source: "none",
            error: missing,
            shouldSyncRoute: false,
        };
    }

    if (allowRetained && retainedId && valid.has(retainedId)) {
        return {
            objectId: retainedId,
            source: "retained",
            error: null,
            shouldSyncRoute: true,
        };
    }

    return {
        objectId: null,
        source: "none",
        error: null,
        shouldSyncRoute: false,
    };
}

/**
 * Concern + nested item projection for Back/Forward.
 * URL wins when route concern or object identity changes.
 */
export function resolveConfigurationObjectConcernState<T extends string>(args: {
    routeConcern: T;
    routeItemId: string | null;
    localConcern: T;
    localItemId: string | null;
    routeObjectId: string | null;
    localObjectId: string | null;
}): { concern: T; itemId: string | null; objectChanged: boolean } {
    const routeObjectId = String(args.routeObjectId ?? "").trim() || null;
    const localObjectId = String(args.localObjectId ?? "").trim() || null;
    const objectChanged = routeObjectId !== localObjectId;
    if (objectChanged || args.routeConcern !== args.localConcern) {
        return {
            concern: args.routeConcern,
            itemId: args.routeItemId,
            objectChanged,
        };
    }
    return {
        concern: args.localConcern,
        itemId: args.localItemId,
        objectChanged: false,
    };
}

/** Latest object + concern generation wins — reject stale async responses. */
export function shouldApplyConfigurationObjectResponse(args: {
    requestSeq: number;
    latestSeq: number;
    requestObjectId: string;
    activeObjectId: string;
    requestConcern?: string | null;
    activeConcern?: string | null;
}): boolean {
    if (args.requestSeq !== args.latestSeq) return false;
    if (args.requestObjectId !== args.activeObjectId) return false;
    if (
        args.requestConcern != null
        && args.activeConcern != null
        && args.requestConcern !== args.activeConcern
    ) {
        return false;
    }
    return true;
}
