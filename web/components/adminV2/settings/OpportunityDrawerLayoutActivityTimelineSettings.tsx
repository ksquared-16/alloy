"use client";

import { layoutBuilderEditableInputProps } from "@/lib/layout/layoutBuilderEditableInput";
import {
    ACTIVITY_TIMELINE_DIRECTIONS,
    ACTIVITY_TIMELINE_DISPLAY_MODE_LABELS,
    ACTIVITY_TIMELINE_DISPLAY_MODES,
    ACTIVITY_TIMELINE_EVENT_TYPES,
    ACTIVITY_TIMELINE_RELATED_SCOPE_LABELS,
    activityTimelineAllowedRelatedScopesForSurface,
    defaultTimelineDirectionForDisplayMode,
    readLayoutEditorActivityTimelineConfig,
    writeLayoutEditorActivityTimelineConfig,
    type ActivityTimelineEventType,
    type ActivityTimelineRelatedScope,
    type ActivityTimelineSurfaceKey,
    type LayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";

type Props = {
    metadata: Record<string, unknown> | undefined;
    surfaceKey: ActivityTimelineSurfaceKey;
    onChange: (metadata: Record<string, unknown>) => void;
};

function patchConfig(
    metadata: Record<string, unknown> | undefined,
    surfaceKey: ActivityTimelineSurfaceKey,
    patch: Partial<LayoutEditorActivityTimelineConfig>,
): Record<string, unknown> {
    const current = readLayoutEditorActivityTimelineConfig(metadata, surfaceKey);
    return writeLayoutEditorActivityTimelineConfig(metadata, { ...current, ...patch });
}

export default function OpportunityDrawerLayoutActivityTimelineSettings({
    metadata,
    surfaceKey,
    onChange,
}: Props) {
    const config = readLayoutEditorActivityTimelineConfig(metadata, surfaceKey);
    const allowedScopes = activityTimelineAllowedRelatedScopesForSurface(surfaceKey);
    const defaultDirection = defaultTimelineDirectionForDisplayMode(config.displayMode);

    return (
        <div className="space-y-3 rounded-lg border border-alloy-pine/15 bg-alloy-pine/[0.03] p-3" data-testid="visual-editor-activity-timeline-settings">
            <p className="text-[11px] font-semibold text-alloy-midnight">Activity timeline</p>
            <p className="text-[10px] leading-relaxed text-alloy-midnight/50">
                Historical event stream for this record. Distinct from Tasks (work) and Notes (authored content).
            </p>

            <label className="block text-[11px] text-alloy-midnight/60">
                Display mode
                <select
                    value={config.displayMode}
                    onChange={(e) =>
                        onChange(
                            patchConfig(metadata, surfaceKey, {
                                displayMode: e.target.value as LayoutEditorActivityTimelineConfig["displayMode"],
                            }),
                        )
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-activity-timeline-display-mode"
                >
                    {ACTIVITY_TIMELINE_DISPLAY_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                            {ACTIVITY_TIMELINE_DISPLAY_MODE_LABELS[mode]}
                        </option>
                    ))}
                </select>
            </label>

            <label className="block text-[11px] text-alloy-midnight/60">
                Max items
                <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.maxItems}
                    {...layoutBuilderEditableInputProps}
                    onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (!Number.isFinite(parsed)) return;
                        onChange(patchConfig(metadata, surfaceKey, { maxItems: parsed }));
                    }}
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-activity-timeline-max-items"
                />
            </label>

            <label className="block text-[11px] text-alloy-midnight/60">
                Timeline direction
                <select
                    value={config.timelineDirection ?? defaultDirection}
                    onChange={(e) =>
                        onChange(
                            patchConfig(metadata, surfaceKey, {
                                timelineDirection: e.target.value as LayoutEditorActivityTimelineConfig["timelineDirection"],
                            }),
                        )
                    }
                    className="mt-1 w-full rounded-md border border-alloy-forge/20 px-2 py-1 text-xs"
                    data-testid="visual-editor-activity-timeline-direction"
                >
                    {ACTIVITY_TIMELINE_DIRECTIONS.map((direction) => (
                        <option key={direction} value={direction}>
                            {direction === "oldest_first" ? "Oldest first (left → right on horizontal)" : "Newest first"}
                        </option>
                    ))}
                </select>
            </label>

            <label className="flex items-start gap-2 text-[11px] text-alloy-midnight/70">
                <input
                    type="checkbox"
                    checked={config.includeRelatedRecords}
                    onChange={(e) => {
                        const includeRelatedRecords = e.target.checked;
                        onChange(
                            patchConfig(metadata, surfaceKey, {
                                includeRelatedRecords,
                                relatedRecordScopes:
                                    includeRelatedRecords ? config.relatedRecordScopes : [],
                            }),
                        );
                    }}
                    className="mt-0.5"
                    data-testid="visual-editor-activity-timeline-include-related"
                />
                <span>
                    Include related-record activity
                    <span className="mt-0.5 block text-[10px] text-alloy-midnight/45">
                        Off by default — opt in when child or household events should appear on this timeline.
                    </span>
                </span>
            </label>

            {config.includeRelatedRecords ?
                <fieldset className="space-y-1.5">
                    <legend className="text-[11px] font-medium text-alloy-midnight/60">Related record scopes</legend>
                    {allowedScopes.map((scope) => {
                        const checked = config.relatedRecordScopes.includes(scope);
                        return (
                            <label key={scope} className="flex items-center gap-2 text-[11px] text-alloy-midnight/70">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                        const next = new Set(config.relatedRecordScopes);
                                        if (e.target.checked) next.add(scope);
                                        else next.delete(scope);
                                        onChange(
                                            patchConfig(metadata, surfaceKey, {
                                                relatedRecordScopes: [...next],
                                            }),
                                        );
                                    }}
                                    data-testid={`visual-editor-activity-timeline-scope-${scope}`}
                                />
                                {ACTIVITY_TIMELINE_RELATED_SCOPE_LABELS[scope]}
                            </label>
                        );
                    })}
                </fieldset>
            :   null}

            <fieldset className="space-y-1.5">
                <legend className="text-[11px] font-medium text-alloy-midnight/60">Event types</legend>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                    {ACTIVITY_TIMELINE_EVENT_TYPES.map((eventType) => {
                        const checked = config.eventTypes.includes(eventType);
                        return (
                            <label key={eventType} className="flex items-center gap-2 text-[10px] text-alloy-midnight/70">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                        const next = new Set(config.eventTypes);
                                        if (e.target.checked) next.add(eventType);
                                        else next.delete(eventType);
                                        onChange(
                                            patchConfig(metadata, surfaceKey, {
                                                eventTypes: [...next] as ActivityTimelineEventType[],
                                            }),
                                        );
                                    }}
                                    data-testid={`visual-editor-activity-timeline-event-${eventType}`}
                                />
                                {eventType.replace(/_/g, " ")}
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        </div>
    );
}
