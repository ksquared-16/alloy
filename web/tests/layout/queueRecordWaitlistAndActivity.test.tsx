/** @vitest-environment jsdom */

import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";

import QueueRecordFieldRenderer, { QueueRecordWidgetRenderer } from "@/components/layout/QueueRecordFieldRenderer";
import { createWidgetBlock, type QueueRecordFieldConfig } from "@/lib/layout/queueRecordLayoutV3";
import { buildOpportunityQueueRowRecordFromPreview } from "@/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview";
import { resolveLayoutRuntimeActivityTimeline } from "@/lib/layout/runtime/resolveLayoutRuntimeActivityTimeline";
import { queueRecordActivityTimelineConfig } from "@/lib/layout/runtime/queueRecordWidgetConfig";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import { normalizeQueueRecordLayoutConfig } from "@/lib/layout/runtime/normalizeQueueRecordLayoutConfig";
import { defaultLeadQueueLayoutV3 } from "@/lib/layout/queueRecordLayoutV3";
import {
    allowedQueueRecordWidgetKeys,
    filterCatalogWidgetsForQueueRecord,
} from "@/lib/layout/queueRecordLayoutAllowList";
import { GLOBAL_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { scopeAllowsFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";
import { filterCatalogGroupsForScope } from "@/lib/layout/queueRecordScopeCatalog";
import { catalogGroupsForEntityType } from "@/lib/layout/fieldCatalog";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";

function renderField(field: QueueRecordFieldConfig, record: ProofRuntimeRecord) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
        root.render(
            <QueueRecordFieldRenderer
                resolved={{
                    field,
                    item: { id: field.id, kind: "field", refKey: field.fieldKey },
                    display: String(record[field.fieldKey] ?? ""),
                    isPlaceholder: false,
                    visible: true,
                }}
                record={record}
                anchorRecord={record}
            />,
        );
    });
    return container;
}

describe("queue row live activity timeline hydration", () => {
    it("renders compact timeline from _activity_timeline_events when present", () => {
        const item: QueuePreviewItemVm = {
            id: "opp-live",
            title: "Lee Family",
            quickActions: [],
            layoutRuntimeEnrichment: {
                activityTimelineEvents: [
                    {
                        id: "evt-1",
                        occurred_at: "2026-06-01T14:00:00.000Z",
                        event_type: "note_added",
                        payload: { summary: "Called family back" },
                    },
                ],
                lastActivityAt: "2026-06-01T14:00:00.000Z",
                lastActivitySummary: "Note added",
            },
        };

        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(Array.isArray(record._activity_timeline_events)).toBe(true);
        expect((record._activity_timeline_events as unknown[]).length).toBe(1);

        const entries = resolveLayoutRuntimeActivityTimeline({
            record,
            surfaceKey: "opportunity_drawer",
            config: queueRecordActivityTimelineConfig({ maxItems: 3 }),
        });
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0]?.title).toBeTruthy();

        const block = createWidgetBlock("activity_timeline", "Activity");
        if (block.type !== "widget") throw new Error("expected widget");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        act(() => {
            root.render(<QueueRecordWidgetRenderer block={block} record={record} />);
        });
        expect(container.querySelector("[data-queue-activity-timeline-widget]")).not.toBeNull();
        expect(container.querySelector("[data-queue-activity-timeline-count]")?.getAttribute("data-queue-activity-timeline-count")).not.toBe("0");
    });

    it("falls back to preview resolver when live events are unavailable", () => {
        const record: ProofRuntimeRecord = {
            id: "opp-preview",
            last_activity_at: "2026-06-01T10:00:00.000Z",
            last_activity_summary: "Status: new → contacted",
            "opportunity.status_key": "contacted",
        };

        const entries = resolveLayoutRuntimeActivityTimeline({
            record,
            surfaceKey: "opportunity_drawer",
            config: queueRecordActivityTimelineConfig(),
        });
        expect(entries.length).toBeGreaterThan(0);
    });
});

describe("waitlist placement field renderers", () => {
    const waitlistRecord: ProofRuntimeRecord = {
        id: "cand-1",
        "waitlist.positionLabel": "Position 2/14",
        "waitlist.tierLabel": "Sibling enrolled",
        "waitlist.priorityLabel": "Sibling enrolled",
        "overrides.flags": "Pinned · Manually adjusted",
    };

    it("renders position and tier as dedicated chips", () => {
        const position = renderField(
            { id: "pos", fieldKey: "waitlist.positionLabel", display: "badge" },
            waitlistRecord,
        );
        expect(position.querySelector("[data-queue-waitlist-field='position']")).not.toBeNull();
        expect(position.textContent).toContain("Position 2/14");

        const tier = renderField(
            { id: "tier", fieldKey: "waitlist.tierLabel", display: "badge" },
            waitlistRecord,
        );
        expect(tier.querySelector("[data-queue-waitlist-field='tier']")).not.toBeNull();
        expect(tier.textContent).toContain("Sibling enrolled");
    });

    it("renders override flags chip", () => {
        const override = renderField(
            { id: "ovr", fieldKey: "overrides.flags", display: "badge" },
            waitlistRecord,
        );
        expect(override.querySelector("[data-queue-waitlist-field='override']")).not.toBeNull();
        expect(override.textContent).toContain("Pinned");
    });

    it("maps waitlist candidate VM override kinds on row record", () => {
        const item: QueuePreviewItemVm = {
            id: "cand-1",
            title: "Brooks Family",
            quickActions: [],
            placementWaitlistCandidate: {
                placementCandidateId: "pc-1",
                opportunityId: "opp-1",
                childDisplayName: "Riley Brooks",
                familyDisplayName: "Brooks Family",
                parentDisplayName: "Jordan Brooks",
                cohortKey: "infant-am",
                cohortLabel: "Infant AM",
                cohortSectionTitle: "Infant · AM",
                bucketLabel: "Sibling enrolled",
                waitSinceLabel: "Jun 1",
                linkModeLabel: null,
                isSyntheticFallback: false,
                hasActiveOverride: true,
                activeOverrideKinds: ["pin"],
                activeOverrides: [],
                hasManualPositionAdjustment: true,
                manualAdjustmentReason: "Front desk request",
                pinOverrideId: "pin-1",
                shadowMode: false,
                runtimePositionLabel: "Position 3/12",
                forecastHints: [],
                siblingLabel: null,
                siblingCohorts: [],
                siblingContextLines: [],
                siblingContextDiagnostics: null,
            },
        };

        const record = buildOpportunityQueueRowRecordFromPreview(item);
        expect(record["overrides.flags"]).toContain("Pinned");
        expect(record["overrides.flags"]).toContain("Manually adjusted");
        expect(record["waitlist.priorityLabel"]).toBe("Sibling enrolled");
    });
});

describe("queue layout validation — waitlist scope", () => {
    it("rejects waitlist-only fields on pipeline queue layout", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[3]!;
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        blocks: [
                            ...c.blocks,
                            {
                                id: "waitlist-block",
                                type: "field_group" as const,
                                fields: [{ id: "wl-pos", fieldKey: "waitlist.positionLabel", display: "badge" as const }],
                            },
                        ],
                    }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(next, { isWaitlist: false });
        expect(result.ok).toBe(false);
        expect(result.errors.some((e) => e.message.includes("waitlist queue rows"))).toBe(true);
    });

    it("accepts waitlist placement fields on waitlist queue layout", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const col = config.columns[3]!;
        const next = {
            ...config,
            columns: config.columns.map((c) =>
                c.id === col.id ?
                    {
                        ...c,
                        scope: { type: "lifecycle_context" as const },
                        blocks: [
                            {
                                id: "waitlist-block",
                                type: "field_group" as const,
                                fields: [
                                    { id: "wl-pos", fieldKey: "waitlist.positionLabel", display: "badge" as const },
                                    { id: "wl-tier", fieldKey: "waitlist.tierLabel", display: "badge" as const },
                                ],
                            },
                        ],
                    }
                :   c,
            ),
        };
        const result = validateQueueRecordLayoutConfig(next, { isWaitlist: true });
        expect(result.ok).toBe(true);
    });
});

describe("queue picker-visible refs ⊆ validator allow-list", () => {
    it("pipeline widget picker keys are allow-listed", () => {
        const picker = filterCatalogWidgetsForQueueRecord(GLOBAL_WIDGET_CATALOG, false);
        const allowed = new Set(allowedQueueRecordWidgetKeys(false));
        for (const widget of picker) {
            expect(allowed.has(widget.widgetKey)).toBe(true);
        }
    });

    it("waitlist lifecycle scope picker refs pass scopeAllowsFieldKey", () => {
        const waitlist = catalogGroupsForEntityType("placement_candidate") ?? [];
        const lifecycleScope = { type: "lifecycle_context" as const };
        const scoped = filterCatalogGroupsForScope(waitlist, lifecycleScope);
        const refKeys = scoped.flatMap((g) => g.fields.map((f) => f.refKey));
        expect(refKeys.length).toBeGreaterThan(0);
        for (const refKey of refKeys) {
            expect(scopeAllowsFieldKey(lifecycleScope, refKey)).toBe(true);
        }
    });
});

describe("published queue layout normalization", () => {
    it("normalizes activity_timeline compact config consistently", () => {
        const config = normalizeQueueRecordLayoutConfig(defaultLeadQueueLayoutV3());
        const withTimeline = normalizeQueueRecordLayoutConfig({
            ...config,
            columns: config.columns.map((col, index) =>
                index === 3 ?
                    {
                        ...col,
                        blocks: [...col.blocks, createWidgetBlock("activity_timeline", "Activity", { displayMode: "compact", maxItems: 5 })],
                    }
                :   col,
            ),
        });
        const widget = withTimeline.columns
            .flatMap((c) => c.blocks)
            .find((b) => b.type === "widget" && b.widgetKey === "activity_timeline");
        expect(widget?.type).toBe("widget");
        if (widget?.type === "widget") {
            expect(widget.config?.maxItems).toBe(5);
        }
        expect(validateQueueRecordLayoutConfig(withTimeline, { isWaitlist: false }).ok).toBe(true);
    });
});
