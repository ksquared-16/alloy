/**
 * Activity Timeline widget — shared Experience Builder config (all drawer surfaces).
 *
 * Activity is a historical event stream — distinct from Tasks (actionable work)
 * and Notes (authored content).
 */

import type { SurfaceLayoutKey } from "@/lib/layout/surfaceLayoutRegistry";

export const LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY = "layoutEditorActivityTimelineConfig" as const;

export const ACTIVITY_TIMELINE_DISPLAY_MODES = [
    "vertical_timeline",
    "horizontal_timeline",
    "compact_feed",
] as const;

export type ActivityTimelineDisplayMode = (typeof ACTIVITY_TIMELINE_DISPLAY_MODES)[number];

export const ACTIVITY_TIMELINE_DIRECTIONS = ["newest_first", "oldest_first"] as const;

export type ActivityTimelineDirection = (typeof ACTIVITY_TIMELINE_DIRECTIONS)[number];

export const ACTIVITY_TIMELINE_RELATED_SCOPES = [
    "children",
    "parents",
    "opportunities",
    "household",
] as const;

export type ActivityTimelineRelatedScope = (typeof ACTIVITY_TIMELINE_RELATED_SCOPES)[number];

/** Configurable event categories — mapped from workflow events and VM preview sources. */
export const ACTIVITY_TIMELINE_EVENT_TYPES = [
    "lifecycle",
    "status_change",
    "forms_documents",
    "communications",
    "tasks_work",
    "appointments_tours",
    "notes",
    "profile_changes",
    "enrollment_changes",
    "guardian_household",
    "schedule_attendance",
    "created",
    "updated",
    "activity",
] as const;

export type ActivityTimelineEventType = (typeof ACTIVITY_TIMELINE_EVENT_TYPES)[number];

export type ActivityTimelineSurfaceKey = Extract<
    SurfaceLayoutKey,
    "opportunity_drawer" | "person_drawer" | "child_drawer"
>;

export type LayoutEditorActivityTimelineConfig = {
    displayMode: ActivityTimelineDisplayMode;
    maxItems: number;
    includeRelatedRecords: boolean;
    relatedRecordScopes: ActivityTimelineRelatedScope[];
    eventTypes: ActivityTimelineEventType[];
    timelineDirection?: ActivityTimelineDirection;
};

const DEFAULT_MAX_ITEMS = 20;

export const ACTIVITY_TIMELINE_DISPLAY_MODE_LABELS: Record<ActivityTimelineDisplayMode, string> = {
    vertical_timeline: "Vertical timeline",
    horizontal_timeline: "Horizontal timeline",
    compact_feed: "Compact feed",
};

export const ACTIVITY_TIMELINE_RELATED_SCOPE_LABELS: Record<ActivityTimelineRelatedScope, string> = {
    children: "Linked children",
    parents: "Parents / guardians",
    opportunities: "Linked opportunities",
    household: "Household",
};

const SURFACE_ALLOWED_RELATED_SCOPES: Record<ActivityTimelineSurfaceKey, readonly ActivityTimelineRelatedScope[]> = {
    opportunity_drawer: ["children", "parents", "household"],
    person_drawer: ["children", "opportunities", "household"],
    child_drawer: ["parents", "household", "opportunities"],
};

const SURFACE_DEFAULT_EVENT_TYPES: Record<ActivityTimelineSurfaceKey, ActivityTimelineEventType[]> = {
    opportunity_drawer: [
        "lifecycle",
        "status_change",
        "forms_documents",
        "communications",
        "tasks_work",
        "appointments_tours",
        "notes",
        "activity",
        "created",
        "updated",
    ],
    person_drawer: [
        "profile_changes",
        "communications",
        "notes",
        "forms_documents",
        "activity",
        "created",
        "updated",
    ],
    child_drawer: [
        "profile_changes",
        "enrollment_changes",
        "forms_documents",
        "guardian_household",
        "communications",
        "activity",
        "created",
        "updated",
    ],
};

export function activityTimelineAllowedRelatedScopesForSurface(
    surfaceKey: ActivityTimelineSurfaceKey,
): readonly ActivityTimelineRelatedScope[] {
    return SURFACE_ALLOWED_RELATED_SCOPES[surfaceKey];
}

export function defaultActivityTimelineConfigForSurface(
    surfaceKey: ActivityTimelineSurfaceKey,
): LayoutEditorActivityTimelineConfig {
    return {
        displayMode: "vertical_timeline",
        maxItems: DEFAULT_MAX_ITEMS,
        includeRelatedRecords: false,
        relatedRecordScopes: [],
        eventTypes: [...SURFACE_DEFAULT_EVENT_TYPES[surfaceKey]],
    };
}

export function defaultTimelineDirectionForDisplayMode(
    displayMode: ActivityTimelineDisplayMode,
): ActivityTimelineDirection {
    if (displayMode === "horizontal_timeline") return "oldest_first";
    return "newest_first";
}

export function resolveActivityTimelineDirection(
    config: LayoutEditorActivityTimelineConfig,
): ActivityTimelineDirection {
    return config.timelineDirection ?? defaultTimelineDirectionForDisplayMode(config.displayMode);
}

function isDisplayMode(v: string): v is ActivityTimelineDisplayMode {
    return (ACTIVITY_TIMELINE_DISPLAY_MODES as readonly string[]).includes(v);
}

function isDirection(v: string): v is ActivityTimelineDirection {
    return (ACTIVITY_TIMELINE_DIRECTIONS as readonly string[]).includes(v);
}

function isRelatedScope(v: string): v is ActivityTimelineRelatedScope {
    return (ACTIVITY_TIMELINE_RELATED_SCOPES as readonly string[]).includes(v);
}

function isEventType(v: string): v is ActivityTimelineEventType {
    return (ACTIVITY_TIMELINE_EVENT_TYPES as readonly string[]).includes(v);
}

function normalizeScopes(
    raw: unknown,
    surfaceKey: ActivityTimelineSurfaceKey,
): ActivityTimelineRelatedScope[] {
    if (!Array.isArray(raw)) return [];
    const allowed = new Set(SURFACE_ALLOWED_RELATED_SCOPES[surfaceKey]);
    return raw.filter((entry): entry is ActivityTimelineRelatedScope =>
        typeof entry === "string" && isRelatedScope(entry) && allowed.has(entry),
    );
}

function normalizeEventTypes(
    raw: unknown,
    surfaceKey: ActivityTimelineSurfaceKey,
): ActivityTimelineEventType[] {
    if (!Array.isArray(raw)) return [...SURFACE_DEFAULT_EVENT_TYPES[surfaceKey]];
    const normalized = raw.filter((entry): entry is ActivityTimelineEventType =>
        typeof entry === "string" && isEventType(entry),
    );
    return normalized.length > 0 ? normalized : [...SURFACE_DEFAULT_EVENT_TYPES[surfaceKey]];
}

export function readLayoutEditorActivityTimelineConfig(
    metadata: Record<string, unknown> | undefined,
    surfaceKey: ActivityTimelineSurfaceKey = "opportunity_drawer",
): LayoutEditorActivityTimelineConfig {
    const defaults = defaultActivityTimelineConfigForSurface(surfaceKey);
    const raw = metadata?.[LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY];
    if (!raw || typeof raw !== "object") return defaults;
    const bag = raw as Record<string, unknown>;

    const displayModeRaw = typeof bag.displayMode === "string" ? bag.displayMode.trim() : "";
    const displayMode = isDisplayMode(displayModeRaw) ? displayModeRaw : defaults.displayMode;

    const maxItemsRaw = typeof bag.maxItems === "number" ? bag.maxItems : Number.parseInt(String(bag.maxItems ?? ""), 10);
    const maxItems =
        Number.isFinite(maxItemsRaw) ? Math.min(100, Math.max(1, Math.round(maxItemsRaw))) : defaults.maxItems;

    const includeRelatedRecords = bag.includeRelatedRecords === true;

    const directionRaw = typeof bag.timelineDirection === "string" ? bag.timelineDirection.trim() : "";
    const timelineDirection = isDirection(directionRaw) ? directionRaw : undefined;

    return {
        displayMode,
        maxItems,
        includeRelatedRecords,
        relatedRecordScopes: normalizeScopes(bag.relatedRecordScopes, surfaceKey),
        eventTypes: normalizeEventTypes(bag.eventTypes, surfaceKey),
        ...(timelineDirection ? { timelineDirection } : {}),
    };
}

export function writeLayoutEditorActivityTimelineConfig(
    metadata: Record<string, unknown> | undefined,
    config: LayoutEditorActivityTimelineConfig,
): Record<string, unknown> {
    const next = { ...(metadata ?? {}) };
    next[LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY] = { ...config };
    return next;
}

export function validateLayoutEditorActivityTimelineMetadata(
    metadata: Record<string, unknown> | undefined,
    surfaceKey: ActivityTimelineSurfaceKey,
    path: string,
): string[] {
    const config = readLayoutEditorActivityTimelineConfig(metadata, surfaceKey);
    const errors = validateLayoutEditorActivityTimelineConfig(config, surfaceKey, path);

    const raw = metadata?.[LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY];
    if (raw && typeof raw === "object") {
        const bag = raw as Record<string, unknown>;
        if (Array.isArray(bag.relatedRecordScopes)) {
            const allowed = new Set(SURFACE_ALLOWED_RELATED_SCOPES[surfaceKey]);
            for (const scope of bag.relatedRecordScopes) {
                if (typeof scope === "string" && isRelatedScope(scope) && !allowed.has(scope)) {
                    errors.push(`${path}.relatedRecordScopes: scope "${scope}" is not supported on ${surfaceKey}`);
                }
            }
        }
        if (Array.isArray(bag.eventTypes)) {
            for (const eventType of bag.eventTypes) {
                if (typeof eventType === "string" && !isEventType(eventType)) {
                    errors.push(`${path}.eventTypes: unknown event type "${eventType}" (ignored at runtime)`);
                }
            }
        }
    }

    return errors;
}

export function validateLayoutEditorActivityTimelineConfig(
    config: LayoutEditorActivityTimelineConfig,
    surfaceKey: ActivityTimelineSurfaceKey,
    path: string,
): string[] {
    const errors: string[] = [];
    if (!isDisplayMode(config.displayMode)) {
        errors.push(`${path}.displayMode: unknown display mode "${String(config.displayMode)}"`);
    }
    if (!Number.isFinite(config.maxItems) || config.maxItems < 1 || config.maxItems > 100) {
        errors.push(`${path}.maxItems: must be between 1 and 100`);
    }
    if (config.timelineDirection && !isDirection(config.timelineDirection)) {
        errors.push(`${path}.timelineDirection: unknown direction "${String(config.timelineDirection)}"`);
    }

    const allowedScopes = new Set(SURFACE_ALLOWED_RELATED_SCOPES[surfaceKey]);
    for (const scope of config.relatedRecordScopes) {
        if (!isRelatedScope(scope)) {
            errors.push(`${path}.relatedRecordScopes: unknown scope "${scope}"`);
        } else if (!allowedScopes.has(scope)) {
            errors.push(`${path}.relatedRecordScopes: scope "${scope}" is not supported on ${surfaceKey}`);
        }
    }

    if (config.includeRelatedRecords && config.relatedRecordScopes.length === 0) {
        errors.push(`${path}.relatedRecordScopes: required when includeRelatedRecords is true`);
    }

    for (const eventType of config.eventTypes) {
        if (!isEventType(eventType)) {
            errors.push(`${path}.eventTypes: unknown event type "${eventType}"`);
        }
    }

    return errors;
}
