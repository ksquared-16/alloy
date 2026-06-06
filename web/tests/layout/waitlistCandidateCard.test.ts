/**
 * Layout V2 — Waitlist Candidate Card (Phase 1): VM adapter, default preset,
 * resolver targeting, and graceful handling of missing optional data.
 */

import { describe, expect, it } from "vitest";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { resolveLayout } from "@/lib/layout/layoutResolver";
import { buildWaitlistCandidateCardDefaultDoc, buildWaitlistDefaultDoc } from "@/lib/layout/defaultWaitlistLayouts";
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
            desiredStartDate: "Aug 2026",
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
        expect(vm.child.desiredStartDate).toBe("Aug 2026");
        expect(vm.waitlist.status).toBe("waitlisted");
    });

    it("leaves optional joins undefined when extras are absent (no fabrication)", () => {
        const vm = placementCandidateVmToCardVm(projectionVm());
        expect(vm.child.ageLabel).toBeUndefined();
        expect(vm.household.phone).toBeUndefined();
        expect(vm.household.email).toBeUndefined();
        expect(vm.household.locationName).toBeUndefined();
        expect(vm.child.desiredStartDate).toBeUndefined();
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
    it("places items in the waitlist card zones", () => {
        const zones = zonesOf(doc);
        for (const z of ["header.identity", "header.priority", "header.position", "body.child", "body.household", "actions.stack"]) {
            expect(zones.has(z), z).toBe(true);
        }
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
