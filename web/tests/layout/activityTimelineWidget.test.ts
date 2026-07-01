/**
 * Activity Timeline widget — framework registration, config, and runtime resolver tests.
 */

import { describe, expect, it } from "vitest";
import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { makeWidgetItem } from "@/lib/layout/builderOps";
import { addSectionWidgetItem } from "@/lib/layout/layoutEditorSectionComposition";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import {
    defaultActivityTimelineConfigForSurface,
    defaultTimelineDirectionForDisplayMode,
    LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY,
    readLayoutEditorActivityTimelineConfig,
    resolveActivityTimelineDirection,
    validateLayoutEditorActivityTimelineMetadata,
    writeLayoutEditorActivityTimelineConfig,
} from "@/lib/layout/layoutEditorActivityTimelineConfig";
import {
    isAllowedChildDrawerWidgetKey,
    isAllowedOpportunityDrawerWidgetKey,
    isAllowedPersonDrawerWidgetKey,
} from "@/lib/layout/surfaceLayoutRegistry";
import { validateLayoutDocForSurface } from "@/lib/layout/validateLayoutDocForSurface";
import {
    resolveLayoutRuntimeActivityTimeline,
    sortActivityTimelineEntries,
    type ActivityTimelineEntry,
} from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import { LAYOUT_BUILDER_WIDGET_OPTIONS, layoutBuilderWidgetOptionsForSurface } from "@/lib/layout/layoutBuilderPaletteModel";

function timelineEntry(id: string, atSortKey: number): ActivityTimelineEntry {
    return {
        id,
        eventType: "activity",
        title: id,
        detail: null,
        actorLabel: null,
        at: new Date(atSortKey).toISOString(),
        atSortKey,
        source: "direct",
    };
}

describe("activity_timeline widget catalog", () => {
    it("registers activity_timeline in global widget catalog", () => {
        const widget = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === "activity_timeline");
        expect(widget).toBeDefined();
        expect(widget?.label).toBe("Activity Timeline");
        expect(widget?.defaultDisplayMode).toBe("vertical_timeline");
    });

    it("appears in builder catalog for opportunity, person, and child surfaces", () => {
        expect(isAllowedOpportunityDrawerWidgetKey("activity_timeline")).toBe(true);
        expect(isAllowedPersonDrawerWidgetKey("activity_timeline")).toBe(true);
        expect(isAllowedChildDrawerWidgetKey("activity_timeline")).toBe(true);
        expect(LAYOUT_BUILDER_WIDGET_OPTIONS.some((w) => w.key === "activity_timeline")).toBe(true);
        expect(layoutBuilderWidgetOptionsForSurface("person_drawer").some((w) => w.key === "activity_timeline")).toBe(true);
        expect(layoutBuilderWidgetOptionsForSurface("child_drawer").some((w) => w.key === "activity_timeline")).toBe(true);
    });

    it("keeps legacy activity widget registered separately", () => {
        const legacy = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === "activity");
        const timeline = GLOBAL_WIDGET_CATALOG.find((w) => w.widgetKey === "activity_timeline");
        expect(legacy).toBeDefined();
        expect(timeline).toBeDefined();
        expect(legacy?.widgetKey).not.toBe(timeline?.widgetKey);
        expect(legacy?.defaultDisplayMode).toBe("feed");
    });
});

describe("activity_timeline config schema", () => {
    it("default config validates for each drawer surface", () => {
        for (const surfaceKey of ["opportunity_drawer", "person_drawer", "child_drawer"] as const) {
            const config = defaultActivityTimelineConfigForSurface(surfaceKey);
            expect(
                validateLayoutEditorActivityTimelineMetadata(
                    writeLayoutEditorActivityTimelineConfig({}, config),
                    surfaceKey,
                    "metadata.layoutEditorActivityTimelineConfig",
                ),
            ).toEqual([]);
        }
    });

    it("full-width horizontal timeline config validates on opportunity drawer", () => {
        const metadata = writeLayoutEditorActivityTimelineConfig({}, {
            ...defaultActivityTimelineConfigForSurface("opportunity_drawer"),
            displayMode: "horizontal_timeline",
            maxItems: 12,
        });
        const doc = buildLeadDrawerDefaultDoc();
        const sectionKey = doc.sections.find((s) => s.key !== "kpi")?.key ?? "activity";
        const added = addSectionWidgetItem(doc, sectionKey, 0, 0, "activity_timeline");
        expect(added.ok).toBe(true);
        if (!added.ok) return;

        const patched = {
            ...added.doc,
            sections: added.doc.sections.map((section) =>
                section.key !== sectionKey ? section : {
                    ...section,
                    rows: section.rows.map((row) => ({
                        ...row,
                        columns: row.columns.map((col) => ({
                            ...col,
                            items: col.items.map((item) =>
                                item.id === added.itemId ?
                                    { ...item, metadata: metadata }
                                :   item,
                            ),
                        })),
                    })),
                },
            ),
        };

        const result = validateLayoutDocForSurface(patched);
        expect(result.ok).toBe(true);
        expect(readLayoutEditorActivityTimelineConfig(metadata, "opportunity_drawer").displayMode).toBe(
            "horizontal_timeline",
        );
    });

    it("rejects unsupported relatedRecordScopes per surface", () => {
        const metadata = {
            [LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY]: {
                ...defaultActivityTimelineConfigForSurface("person_drawer"),
                includeRelatedRecords: true,
                relatedRecordScopes: ["parents"],
            },
        };
        const errors = validateLayoutEditorActivityTimelineMetadata(
            metadata,
            "person_drawer",
            "metadata.layoutEditorActivityTimelineConfig",
        );
        expect(errors.some((e) => e.includes("parents") && e.includes("not supported"))).toBe(true);
    });

    it("reports unknown eventTypes safely", () => {
        const metadata = {
            [LAYOUT_EDITOR_ACTIVITY_TIMELINE_CONFIG_METADATA_KEY]: {
                ...defaultActivityTimelineConfigForSurface("opportunity_drawer"),
                eventTypes: ["communications", "not_a_real_event_type"],
            },
        };
        const errors = validateLayoutEditorActivityTimelineMetadata(
            metadata,
            "opportunity_drawer",
            "metadata.layoutEditorActivityTimelineConfig",
        );
        expect(errors.some((e) => e.includes("not_a_real_event_type"))).toBe(true);
    });
});

describe("activity_timeline sort order", () => {
    it("horizontal timeline defaults oldest → newest (left to right)", () => {
        expect(defaultTimelineDirectionForDisplayMode("horizontal_timeline")).toBe("oldest_first");
        const config = {
            ...defaultActivityTimelineConfigForSurface("opportunity_drawer"),
            displayMode: "horizontal_timeline" as const,
        };
        const sorted = sortActivityTimelineEntries(
            [timelineEntry("c", 3000), timelineEntry("a", 1000), timelineEntry("b", 2000)],
            config,
        );
        expect(sorted.map((e) => e.id)).toEqual(["a", "b", "c"]);
        expect(resolveActivityTimelineDirection(config)).toBe("oldest_first");
    });

    it("vertical timeline defaults newest → oldest", () => {
        expect(defaultTimelineDirectionForDisplayMode("vertical_timeline")).toBe("newest_first");
        const config = defaultActivityTimelineConfigForSurface("opportunity_drawer");
        const sorted = sortActivityTimelineEntries(
            [timelineEntry("a", 1000), timelineEntry("c", 3000), timelineEntry("b", 2000)],
            config,
        );
        expect(sorted.map((e) => e.id)).toEqual(["c", "b", "a"]);
    });
});

describe("activity_timeline runtime resolver", () => {
    it("opportunity default doc can render activity_timeline entries from preview fields", () => {
        const entries = resolveLayoutRuntimeActivityTimeline({
            surfaceKey: "opportunity_drawer",
            record: {
                notes: [{ title: "Call note", body: "Followed up", created_at: "2026-01-02T12:00:00.000Z" }],
                recent_communication: [{ channel: "Email", body: "Thanks", at: "2026-01-01T12:00:00.000Z" }],
            },
            config: defaultActivityTimelineConfigForSurface("opportunity_drawer"),
        });
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.some((e) => e.eventType === "notes" || e.eventType === "communications")).toBe(true);
    });

    it("person drawer can add activity_timeline via surface-aware addSectionWidgetItem", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const sectionKey = doc.sections[0]?.key ?? "overview";
        const added = addSectionWidgetItem(doc, sectionKey, 0, 0, "activity_timeline", "person_drawer");
        expect(added.ok).toBe(true);
    });

    it("person drawer can add and resolve activity_timeline", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const sectionKey = doc.sections[0]?.key ?? "overview";
        expect(addSectionWidgetItem(doc, sectionKey, 0, 0, "activity_timeline", "person_drawer").ok).toBe(true);

        const entries = resolveLayoutRuntimeActivityTimeline({
            surfaceKey: "person_drawer",
            record: {
                notes: [{ title: "Profile note", body: "Updated phone", created_at: "2026-02-01T10:00:00.000Z" }],
            },
            config: defaultActivityTimelineConfigForSurface("person_drawer"),
        });
        expect(entries.some((e) => e.eventType === "notes")).toBe(true);
    });

    it("child drawer can add and resolve activity_timeline", () => {
        const doc = buildChildDrawerDefaultDoc();
        const sectionKey = doc.sections[0]?.key ?? "overview";
        const item = makeWidgetItem("activity_timeline", "Activity Timeline", "vertical_timeline");
        item.metadata = writeLayoutEditorActivityTimelineConfig(
            item.metadata,
            defaultActivityTimelineConfigForSurface("child_drawer"),
        );
        expect(validateLayoutDocForSurface({
            ...doc,
            sections: doc.sections.map((section, index) =>
                index === 0 ?
                    {
                        ...section,
                        rows: [{
                            ...section.rows[0]!,
                            columns: [{
                                ...section.rows[0]!.columns[0]!,
                                items: [...section.rows[0]!.columns[0]!.items, item],
                            }],
                        }],
                    }
                :   section,
            ),
        }).ok).toBe(true);

        const entries = resolveLayoutRuntimeActivityTimeline({
            surfaceKey: "child_drawer",
            record: {
                _child_lifecycle_summary_display: "Active enrollment",
                updated_at: "2026-03-01T08:00:00.000Z",
            },
            config: defaultActivityTimelineConfigForSurface("child_drawer"),
        });
        expect(entries.length).toBeGreaterThan(0);
    });

    it("person activity includes child activity only when includeRelatedRecords and children scope are enabled", () => {
        const baseRecord = {
            notes: [{ title: "Parent note", body: "Direct", created_at: "2026-04-02T12:00:00.000Z" }],
            _related_activity_timeline_events: {
                children: [{
                    id: "child-event",
                    occurred_at: "2026-04-01T12:00:00.000Z",
                    event_type: "note_added",
                    payload: { summary: "Child note" },
                }],
            },
        };

        const withoutRelated = resolveLayoutRuntimeActivityTimeline({
            surfaceKey: "person_drawer",
            record: baseRecord,
            config: defaultActivityTimelineConfigForSurface("person_drawer"),
        });
        expect(withoutRelated.every((e) => e.source !== "related")).toBe(true);

        const withRelated = resolveLayoutRuntimeActivityTimeline({
            surfaceKey: "person_drawer",
            record: baseRecord,
            config: {
                ...defaultActivityTimelineConfigForSurface("person_drawer"),
                includeRelatedRecords: true,
                relatedRecordScopes: ["children"],
                eventTypes: [...defaultActivityTimelineConfigForSurface("person_drawer").eventTypes],
            },
        });
        expect(withRelated.some((e) => e.source === "related" && e.relatedScope === "children")).toBe(true);
    });
});
