/**
 * Universal Composition Model — Evidence Group Registry tests.
 *
 * Covers:
 *   - Named group definitions per zone (no abstract labels)
 *   - Waitlist overrides for children and status zones
 *   - labelForQueueGroup and labelForFocusPanelGroup resolution
 *   - All focus-panel card group defs carry non-empty labels
 */

import { describe, expect, it } from "vitest";
import {
    QUEUE_ZONE_EVIDENCE_GROUPS,
    evidenceGroupsForZone,
    labelForQueueGroup,
    labelForFocusPanelGroup,
    FOCUS_PANEL_CARD_EVIDENCE_GROUPS,
} from "@/lib/adminV2/settings/surfaces/compositionEvidenceGroupRegistry";

describe("QUEUE_ZONE_EVIDENCE_GROUPS — named groups, no abstract labels", () => {
    it("every group has a non-empty key and label", () => {
        for (const [zone, groups] of Object.entries(QUEUE_ZONE_EVIDENCE_GROUPS)) {
            for (const group of groups) {
                expect(group.key.trim(), `zone ${zone} group key`).not.toBe("");
                expect(group.label.trim(), `zone ${zone} group label`).not.toBe("");
            }
        }
    });

    it("no group label starts with 'Evidence Group' or 'Group'", () => {
        for (const groups of Object.values(QUEUE_ZONE_EVIDENCE_GROUPS)) {
            for (const group of groups) {
                expect(group.label, `label "${group.label}" is abstract`).not.toMatch(/^(Evidence Group|Group) \d/i);
            }
        }
    });

    it("household zone has exactly one group: Primary Contact", () => {
        const groups = QUEUE_ZONE_EVIDENCE_GROUPS["household"] ?? [];
        expect(groups).toHaveLength(1);
        expect(groups[0]!.key).toBe("primary_contact");
        expect(groups[0]!.label).toBe("Primary Contact");
    });

    it("children zone has two groups: Child Summary and Placement", () => {
        const groups = QUEUE_ZONE_EVIDENCE_GROUPS["children"] ?? [];
        expect(groups).toHaveLength(2);
        expect(groups[0]!.key).toBe("child_summary");
        expect(groups[1]!.key).toBe("placement");
    });

    it("status zone has Stage & Disposition group", () => {
        const groups = QUEUE_ZONE_EVIDENCE_GROUPS["status"] ?? [];
        expect(groups.some((g) => g.key === "stage_disposition")).toBe(true);
    });

    it("attention zone has Attention Signal group", () => {
        const groups = QUEUE_ZONE_EVIDENCE_GROUPS["attention"] ?? [];
        expect(groups.some((g) => g.key === "attention_signal")).toBe(true);
    });

    it("all groups have non-empty defaultFieldKeys arrays (or declared empty)", () => {
        for (const [zone, groups] of Object.entries(QUEUE_ZONE_EVIDENCE_GROUPS)) {
            for (const group of groups) {
                expect(Array.isArray(group.defaultFieldKeys), `zone ${zone} group ${group.key}`).toBe(true);
            }
        }
    });
});

describe("evidenceGroupsForZone — pipeline vs waitlist", () => {
    it("returns pipeline children groups when isWaitlist=false", () => {
        const groups = evidenceGroupsForZone("children", false);
        expect(groups[0]!.key).toBe("child_summary");
    });

    it("returns waitlist children groups when isWaitlist=true", () => {
        const groups = evidenceGroupsForZone("children", true);
        expect(groups[0]!.key).toBe("candidate_summary");
    });

    it("waitlist status group is 'Waitlist & Placement', not 'Stage & Disposition'", () => {
        const groups = evidenceGroupsForZone("status", true);
        expect(groups[0]!.key).toBe("waitlist_position");
        expect(groups[0]!.label).toBe("Waitlist & Placement");
    });

    it("pipeline status group is 'Stage & Disposition'", () => {
        const groups = evidenceGroupsForZone("status", false);
        expect(groups[0]!.key).toBe("stage_disposition");
    });

    it("household zone has same groups for both pipeline and waitlist", () => {
        const pipeline = evidenceGroupsForZone("household", false);
        const waitlist = evidenceGroupsForZone("household", true);
        expect(waitlist).toEqual(pipeline);
    });

    it("unknown zone returns empty array", () => {
        const groups = evidenceGroupsForZone("unknown_zone_xyz");
        expect(groups).toHaveLength(0);
    });
});

describe("labelForQueueGroup — named label resolution", () => {
    it("returns canonical label for known group key", () => {
        expect(labelForQueueGroup("household", "primary_contact")).toBe("Primary Contact");
    });

    it("returns canonical waitlist label for waitlist group key", () => {
        expect(labelForQueueGroup("children", "candidate_summary", true)).toBe("Candidate Summary");
    });

    it("title-cases unknown group key as fallback", () => {
        const label = labelForQueueGroup("household", "some_unknown_group");
        expect(label).toBe("Some Unknown Group");
    });

    it("never returns abstract 'Evidence Group N' for known zones", () => {
        for (const zone of ["household", "children", "status", "attention", "date_event"]) {
            const groups = evidenceGroupsForZone(zone);
            for (const group of groups) {
                const label = labelForQueueGroup(zone, group.key);
                expect(label).not.toMatch(/^Evidence Group \d/i);
            }
        }
    });
});

describe("FOCUS_PANEL_CARD_EVIDENCE_GROUPS — named card groups", () => {
    it("household card has Primary Contact and Additional Contacts groups", () => {
        const groups = FOCUS_PANEL_CARD_EVIDENCE_GROUPS["household"] ?? [];
        const keys = groups.map((g) => g.key);
        expect(keys).toContain("primary_contact");
        expect(keys).toContain("additional_contacts");
    });

    it("children card has all 6 canonical groups", () => {
        const groups = FOCUS_PANEL_CARD_EVIDENCE_GROUPS["children"] ?? [];
        const keys = groups.map((g) => g.key);
        expect(keys).toContain("identity");
        expect(keys).toContain("placement");
        expect(keys).toContain("medical");
        expect(keys).toContain("documents");
        expect(keys).toContain("readiness");
        expect(keys).toContain("notes");
    });

    it("billing_preview card has billing_responsibility and tuition groups", () => {
        const groups = FOCUS_PANEL_CARD_EVIDENCE_GROUPS["billing_preview"] ?? [];
        const keys = groups.map((g) => g.key);
        expect(keys).toContain("billing_responsibility");
        expect(keys).toContain("tuition");
    });

    it("every defined group has a non-empty label", () => {
        for (const [card, groups] of Object.entries(FOCUS_PANEL_CARD_EVIDENCE_GROUPS)) {
            for (const group of groups ?? []) {
                expect(group.label.trim(), `card ${card} group ${group.key}`).not.toBe("");
            }
        }
    });
});

describe("labelForFocusPanelGroup — named label resolution", () => {
    it("returns canonical label for known card + group", () => {
        expect(labelForFocusPanelGroup("household", "primary_contact")).toBe("Primary Contact");
        expect(labelForFocusPanelGroup("children", "identity")).toBe("Identity");
        expect(labelForFocusPanelGroup("children", "placement")).toBe("Placement");
    });

    it("title-cases unknown group key as fallback", () => {
        const label = labelForFocusPanelGroup("household", "some_group_key");
        expect(label).toBe("Some Group Key");
    });

    it("unknown card + unknown group returns title-cased fallback", () => {
        const label = labelForFocusPanelGroup("some_unknown_card", "other_group");
        expect(label).toBe("Other Group");
    });
});
