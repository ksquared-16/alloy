/**
 * Layout V2 — Waitlist Candidate Card (Phase 1): VM adapter, default preset,
 * resolver targeting, and graceful handling of missing optional data.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { buildWaitlistCandidateCardDefaultDoc, buildWaitlistDefaultDoc, readWaitlistGroupConfig } from "@/lib/layout/defaultWaitlistLayouts";
import { catalogGroupsForEntityType, catalogWidgetsForEntityType, CONTEXT_WIDGET_CATALOG } from "@/lib/layout/fieldCatalog";
import { buildLeadQueueDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import { LAYOUT_QUEUE_ZONES } from "@/lib/layout/layoutV2";
import { placementCandidateVmToCardVm } from "@/lib/layout/waitlist/placementRowToCardVm";
import { waitlistCardVmToProofRecord, WAITLIST_CARD_RENDER_AS } from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";
import type { LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";

function zonesOf(doc: LayoutDoc): Set<string> {
    const zones = new Set<string>();
    const walk = (items: LayoutItem[]) => {
        for (const it of items) {
            const z = (it.metadata as { zone?: string } | undefined)?.zone;
            if (z) zones.add(z);
        }
    };
    doc.sections.forEach((s) => s.rows.forEach((r) => r.columns.forEach((c) => walk(c.items))));
    return zones;
}

/** A representative projection VM (what the live placement runtime emits). */
function projectionVm(overrides: Partial<QueueRowPlacementWaitlistCandidateVm> = {}): QueueRowPlacementWaitlistCandidateVm {
    return {
        placementCandidateId: "cand-1",
        opportunityId: "opp-1",
        childDisplayName: "Avery (3y)",
        familyDisplayName: "Nguyen",
        parentDisplayName: "Jordan Nguyen",
        cohortKey: "toddler",
        cohortLabel: "Toddler",
        cohortSectionTitle: "Toddler waitlist",
        bucketLabel: "Sibling enrolled",
        waitSinceLabel: "May 15",
        linkModeLabel: null,
        isSyntheticFallback: false,
        hasActiveOverride: true,
        activeOverrideKinds: ["pin"],
        activeOverrides: [{ id: "ov-1", overrideKind: "pin", reason: "Sibling alignment" }],
        hasManualPositionAdjustment: true,
        manualAdjustmentReason: "Sibling alignment",
        pinOverrideId: "ov-1",
        shadowMode: false,
        runtimePosition: 3,
        runtimePositionTotal: 12,
        runtimePositionLabel: "Position 3/12",
        runtimePositionMode: "live",
        runtimePositionSectionKey: "toddler",
        runtimePositionHelp: "Within Toddler section",
        runtimePositionPrecedenceNote: undefined,
        forecastHints: [],
        siblingLabel: null,
        siblingCohorts: [],
        siblingContextLines: [],
        siblingContextDiagnostics: null,
        ...overrides,
    };
}

describe("placementCandidateVmToCardVm (adapter)", () => {
    it("maps projection data, preserving runtime tier/position/override verbatim", () => {
        const vm = placementCandidateVmToCardVm(projectionVm(), {
            householdId: "cust-1",
            childId: "person-1",
            startDate: "Aug 2026",
            status: "waitlisted",
            household: { phone: "(555) 010-2244", email: "j@example.com", locationName: "North Campus" },
            child: { ageLabel: "3y" },
        });
        expect(vm.candidateId).toBe("cand-1");
        expect(vm.child.name).toBe("Avery (3y)");
        expect(vm.waitlist.tierLabel).toBe("Sibling enrolled"); // verbatim, not recomputed
        expect(vm.waitlist.positionLabel).toBe("Position 3/12");
        expect(vm.waitlist.positionMode).toBe("live");
        expect(vm.overrides.pinned).toBe(true);
        expect(vm.overrides.manuallyAdjusted).toBe(true);
        expect(vm.household.phone).toBe("(555) 010-2244");
        expect(vm.child.startDate).toBe("Aug 2026");
        expect(vm.waitlist.status).toBe("waitlisted");
    });

    it("leaves optional joins undefined when extras are absent (no fabrication)", () => {
        const vm = placementCandidateVmToCardVm(projectionVm());
        expect(vm.child.ageLabel).toBeUndefined();
        expect(vm.household.phone).toBeUndefined();
        expect(vm.household.email).toBeUndefined();
        expect(vm.household.locationName).toBeUndefined();
        expect(vm.child.startDate).toBeUndefined();
        // capability flags default to enabled (simulated) in proof
        expect(vm.actions.canOpen).toBe(true);
    });

    it("does not surface override kinds that aren't active", () => {
        const vm = placementCandidateVmToCardVm(
            projectionVm({ hasActiveOverride: false, activeOverrideKinds: [], hasManualPositionAdjustment: false, manualAdjustmentReason: null }),
        );
        expect(vm.overrides.hasActive).toBe(false);
        expect(vm.overrides.pinned).toBe(false);
        expect(vm.overrides.tierBoost).toBe(false);
    });
});

describe("waitlistCardVmToProofRecord (graceful missing data)", () => {
    it("emits null for absent optional fields, never a fabricated value", () => {
        const vm = placementCandidateVmToCardVm(projectionVm({ runtimePositionLabel: undefined, bucketLabel: "" }));
        const rec = waitlistCardVmToProofRecord(vm);
        expect(rec["household.phone"]).toBeNull();
        expect(rec["waitlist.positionLabel"]).toBeNull();
        expect(rec["waitlist.tierLabel"]).toBeNull();
        // present values survive
        expect(rec["child.name"]).toBe("Avery (3y)");
        expect(rec["overrides.flags"]).toContain("Pinned");
    });
});

describe("default waitlist preset", () => {
    const doc = buildWaitlistCandidateCardDefaultDoc();
    it("is a valid placement_candidate queue card", () => {
        const res = parseLayoutDoc(doc);
        expect(res.ok, res.errors.join("; ")).toBe(true);
        expect(doc.surface).toBe("queue");
        expect(doc.entityType).toBe("placement_candidate");
        expect(doc.metadata?.renderAs).toBe(WAITLIST_CARD_RENDER_AS);
    });
    it("places items in the unified card zones incl. the Context Area", () => {
        const zones = zonesOf(doc);
        for (const z of ["header.identity", "header.status", "header.priority", "context.primary", "body.contact", "actions.stack"]) {
            expect(zones.has(z), z).toBe(true);
        }
    });
    it("moves waitlist-specific content into the Context Area (not a special path)", () => {
        const ctxItems = doc.sections
            .flatMap((s) => s.rows).flatMap((r) => r.columns).flatMap((c) => c.items)
            .filter((it) => String((it.metadata as { zone?: string } | undefined)?.zone ?? "").startsWith("context."));
        const refs = ctxItems.map((i) => i.refKey);
        expect(refs).toContain("waitlist_position");
        expect(refs).toContain("waitlisted_since");
        expect(refs).toContain("sibling_context");
        expect(refs).toContain("waitlist_adjustment");
    });
    it("reserves the action stack without owning behavior", () => {
        const action = doc.sections[0].rows[0].columns[1].items.find((i) => i.refKey === "actions");
        expect((action?.metadata as { actions?: string[] } | undefined)?.actions).toContain("Create Offer");
    });
});

describe("resolver targeting", () => {
    it("resolves placement_candidate + queue to the curated waitlist card", () => {
        const r = resolveLayout({ entityType: "placement_candidate", surface: "queue" });
        expect(r.source).toBe("default");
        expect(r.doc.entityType).toBe("placement_candidate");
        expect(r.doc.metadata?.renderAs).toBe(WAITLIST_CARD_RENDER_AS);
    });
    it("buildWaitlistDefaultDoc returns null for unrelated entities/surfaces", () => {
        expect(buildWaitlistDefaultDoc("opportunities", "queue")).toBeNull();
        expect(buildWaitlistDefaultDoc("placement_candidate", "drawer")).toBeNull();
    });
});

describe("waitlist field & widget catalog (Goals 4/5)", () => {
    it("exposes the full waitlist field catalog (not artificially limited)", () => {
        const groups = catalogGroupsForEntityType("placement_candidate");
        expect(groups).not.toBeNull();
        const labels = (groups ?? []).map((g) => g.entityLabel);
        for (const cat of ["Candidate", "Child", "Parent", "Household", "Location", "Program", "Lifecycle", "System"]) {
            expect(labels).toContain(cat);
        }
        // bucket keys are unique (the picker keys on entityKey)
        const keys = (groups ?? []).map((g) => g.entityKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
    it("returns waitlist widgets including a placeable Waitlist Adjustment", () => {
        const widgets = catalogWidgetsForEntityType().map((w) => w.widgetKey);
        for (const w of ["waitlist_position", "waitlist_tier", "waitlist_override", "waitlist_adjustment", "capacity_recommendation"]) {
            expect(widgets).toContain(w);
        }
    });
    it("widgets are a single global catalog on every surface (relevance-flagged, not hidden)", () => {
        const widgets = catalogWidgetsForEntityType();
        const keys = widgets.map((w) => w.widgetKey);
        expect(keys).toContain("tasks");
        // global catalog still lists waitlist widgets, but flagged queue-relevant
        expect(keys).toContain("waitlist_adjustment");
        expect(widgets.find((w) => w.widgetKey === "waitlist_adjustment")?.relevantSurfaces).toEqual(["queue"]);
    });
});

describe("one queue-card engine — Context Area + reuse", () => {
    it("Context Area is part of the shared queue zone vocabulary", () => {
        expect(LAYOUT_QUEUE_ZONES).toContain("context.primary");
        expect(LAYOUT_QUEUE_ZONES).toContain("context.secondary");
    });
    it("context widgets are reusable (not waitlist-only architecture)", () => {
        const keys = CONTEXT_WIDGET_CATALOG.map((w) => w.widgetKey);
        for (const k of ["waitlist_position", "waitlisted_since", "sibling_context", "waitlist_adjustment"]) {
            expect(keys).toContain(k);
        }
    });
    it("Lead queue and Waitlist card share the same engine concepts (zones + actions)", () => {
        const lead = buildLeadQueueDefaultDoc();
        const wl = buildWaitlistCandidateCardDefaultDoc();
        const zonesOfDoc = (d: LayoutDoc) =>
            new Set(
                d.sections.flatMap((s) => s.rows).flatMap((r) => r.columns).flatMap((c) => c.items)
                    .map((it) => String((it.metadata as { zone?: string } | undefined)?.zone ?? "")),
            );
        // Both place an Actions stack and use the same bounded zone vocabulary.
        expect(zonesOfDoc(lead).has("actions.stack")).toBe(true);
        expect(zonesOfDoc(wl).has("actions.stack")).toBe(true);
        // Every zone used by either doc is a member of the shared vocabulary.
        for (const z of [...zonesOfDoc(lead), ...zonesOfDoc(wl)].filter(Boolean)) {
            expect(LAYOUT_QUEUE_ZONES as readonly string[]).toContain(z);
        }
        // Both are the queue surface — the only differences are fields/widgets/group display.
        expect(lead.surface).toBe("queue");
        expect(wl.surface).toBe("queue");
    });
});

describe("waitlist group display config (Goal 6 — display only)", () => {
    it("ships sensible defaults on the preset", () => {
        const cfg = readWaitlistGroupConfig(buildWaitlistCandidateCardDefaultDoc());
        expect(cfg.showGroupHeader).toBe(true);
        expect(cfg.showRuntimePosition).toBe(true);
        expect(cfg.headerTemplate).toContain("{label}");
    });
    it("reads overrides and falls back safely", () => {
        const cfg = readWaitlistGroupConfig({ metadata: { group: { showGroupHeader: false, headerTemplate: "Priority {label}" } } });
        expect(cfg.showGroupHeader).toBe(false);
        expect(cfg.headerTemplate).toBe("Priority {label}");
        expect(cfg.showGroupCount).toBe(true); // default preserved
        // empty/absent metadata → all defaults
        const def = readWaitlistGroupConfig(null);
        expect(def.showGroupHeader).toBe(true);
    });
});
