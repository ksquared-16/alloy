import { describe, expect, it } from "vitest";

import {
    composeEffectiveCardModel,
    configFields,
    effectiveFieldOwner,
    evidenceGroupsFromConfig,
    validateFocusPanelCardConfig,
    type FocusPanelCardConfig,
    type FocusPanelCardField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import {
    addEvidenceGroup,
    addFieldToGroup,
    moveEvidenceGroup,
    moveFieldToGroup,
    normalizeToEvidenceGroups,
    removeEvidenceGroup,
    setFieldOwnership,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

function field(id: string, label: string, extra: Partial<FocusPanelCardField> = {}): FocusPanelCardField {
    return { id, label, concept: `Concept → ${label}`, renderer: "text", placement: "collapsed", kind: "field", ...extra };
}

describe("Card Definition V2 — evidence groups + ownership", () => {
    it("configFields flattens evidence groups in reading order", () => {
        const config: FocusPanelCardConfig = {
            evidenceGroups: [
                { id: "identity", label: "Identity", fields: [field("a", "Name")] },
                { id: "enrollment", label: "Enrollment", fields: [field("b", "Program"), field("c", "Start")] },
            ],
        };
        expect(configFields(config).map((f) => f.id)).toEqual(["a", "b", "c"]);
    });

    it("wraps legacy flat fields into a single Details group (back-compat)", () => {
        const legacy: FocusPanelCardConfig = { fields: [field("a", "Name"), field("b", "Email")] };
        const groups = evidenceGroupsFromConfig(legacy);
        expect(groups).toHaveLength(1);
        expect(groups[0]!.label).toBe("Details");
        expect(configFields(legacy).map((f) => f.id)).toEqual(["a", "b"]);
    });

    it("composeEffectiveCardModel renders fields from groups exactly like the legacy flat list", () => {
        const base: FocusPanelCardModel = {
            key: "household",
            archetype: "profile",
            title: "Household",
            insight: "—",
            tier: "context",
            span: 1,
            density: "standard",
            visible: true,
            payload: { profileFields: [] },
        };
        const flat: FocusPanelCardConfig = { fields: [field("a", "Name"), field("b", "Email")] };
        const grouped: FocusPanelCardConfig = {
            evidenceGroups: [
                { id: "identity", label: "Identity", fields: [field("a", "Name")] },
                { id: "contact", label: "Contact", fields: [field("b", "Email")] },
            ],
        };
        const fromFlat = composeEffectiveCardModel(base, flat, {});
        const fromGroups = composeEffectiveCardModel(base, grouped, {});
        expect((fromGroups.payload!.profileFields ?? []).map((f) => f.label)).toEqual(["Name", "Email"]);
        expect((fromGroups.payload!.profileFields ?? []).map((f) => f.label)).toEqual(
            (fromFlat.payload!.profileFields ?? []).map((f) => f.label),
        );
    });

    it("ownership: a concept is editable only on its owning card", () => {
        const owner = effectiveFieldOwner(field("p", "Phone"), "household");
        expect(owner).toBe("household"); // defaults to host

        // Phone shown on Children but owned by Household, marked editable → ownership issue.
        const config: FocusPanelCardConfig = {
            evidenceGroups: [
                { id: "contact", label: "Contact", fields: [field("p", "Phone", { owner: "household", editable: true })] },
            ],
        };
        const result = validateFocusPanelCardConfig(config, "children");
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.scope === "ownership" && i.ref === "p")).toBe(true);

        // Editable on the owning card itself → fine.
        expect(validateFocusPanelCardConfig(config, "household").ok).toBe(true);
    });

    it("validates that an evidence group has a name", () => {
        const config: FocusPanelCardConfig = {
            evidenceGroups: [{ id: "x", label: "  ", fields: [field("a", "Name")] }],
        };
        const result = validateFocusPanelCardConfig(config, "household");
        expect(result.issues.some((i) => i.scope === "group")).toBe(true);
    });

    it("ops: add/move/remove groups + move a field between them, normalizing legacy first", () => {
        const legacy: FocusPanelCardConfig = { fields: [field("a", "Name")] };
        // First edit normalizes legacy → a Details group, then adds Placement.
        let config = addEvidenceGroup(legacy, "Placement");
        expect(config.fields).toBeUndefined();
        expect(config.evidenceGroups!.map((g) => g.label)).toEqual(["Details", "Placement"]);

        const placementId = config.evidenceGroups!.find((g) => g.label === "Placement")!.id;
        config = addFieldToGroup(config, placementId, field("prog", "Program"));
        config = moveFieldToGroup(config, "a", placementId);
        const placement = config.evidenceGroups!.find((g) => g.id === placementId)!;
        expect(placement.fields.map((f) => f.id)).toEqual(["prog", "a"]);
        // Details is now empty (its only field moved out).
        expect(config.evidenceGroups!.find((g) => g.label === "Details")!.fields).toHaveLength(0);

        config = moveEvidenceGroup(config, placementId, -1);
        expect(config.evidenceGroups!.map((g) => g.label)).toEqual(["Placement", "Details"]);

        config = removeEvidenceGroup(config, placementId);
        expect(config.evidenceGroups!.map((g) => g.label)).toEqual(["Details"]);
        expect(configFields(config)).toHaveLength(0); // Placement's fields went with it
    });

    it("ops: set per-field ownership + behavior flags", () => {
        const config = setFieldOwnership(
            { evidenceGroups: [{ id: "c", label: "Contact", fields: [field("p", "Phone")] }] },
            "p",
            { owner: "household", editable: true, required: true },
        );
        const phone = configFields(config).find((f) => f.id === "p")!;
        expect(phone.owner).toBe("household");
        expect(phone.editable).toBe(true);
        expect(phone.required).toBe(true);
    });

    it("normalizeToEvidenceGroups drops the legacy flat list", () => {
        const normalized = normalizeToEvidenceGroups({ fields: [field("a", "Name")] });
        expect(normalized.fields).toBeUndefined();
        expect(normalized.evidenceGroups).toHaveLength(1);
    });
});

describe("evidence-group field ops used by the Inspector", () => {
    it("updateFieldInGroups patches a field wherever it lives", async () => {
        const { updateFieldInGroups } = await import("@/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps");
        const config = {
            evidenceGroups: [
                { id: "identity", label: "Identity", fields: [field("a", "Name")] },
                { id: "contact", label: "Contact", fields: [field("b", "Email")] },
            ],
        };
        const next = updateFieldInGroups(config, "b", { label: "Work Email", renderer: "text" });
        expect(configFields(next).find((f) => f.id === "b")!.label).toBe("Work Email");
    });

    it("moveFieldWithinGroup reorders inside the group only", async () => {
        const { moveFieldWithinGroup } = await import("@/lib/adminV2/runtime/focusPanel/focusPanelEvidenceGroupOps");
        const config = {
            evidenceGroups: [
                { id: "identity", label: "Identity", fields: [field("a", "Name"), field("b", "DOB"), field("c", "Sex")] },
            ],
        };
        const next = moveFieldWithinGroup(config, "c", -1);
        expect(next.evidenceGroups![0]!.fields.map((f) => f.id)).toEqual(["a", "c", "b"]);
        // clamped at the top
        expect(moveFieldWithinGroup(next, "a", -1).evidenceGroups![0]!.fields.map((f) => f.id)).toEqual(["a", "c", "b"]);
    });
});
