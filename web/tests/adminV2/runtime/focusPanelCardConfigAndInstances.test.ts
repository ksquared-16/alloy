import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelInstanceMap } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    buildCompositionOverrides,
    clampCompositionOverride,
    composeEffectiveCardModel,
    compositionOverrideFromConfig,
    isFocusPanelCardConfigEmpty,
    validateFocusPanelCardConfig,
    type FocusPanelCardConfig,
    type FocusPanelCardField,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { composeFocusPanelSurface } from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import { resolveConceptValue } from "@/lib/adminV2/runtime/focusPanel/focusPanelConceptCatalog";
import {
    buildSummaryDocFromOrder,
    duplicateSummaryCard,
    entryInstanceId,
    readSummaryCardOrder,
    updateSummaryCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

const baseOrder = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);

const baseModel: FocusPanelCardModel = {
    key: "household",
    archetype: "profile",
    title: "Household",
    insight: "Primary contact",
    tier: "context",
    span: 2,
    density: "standard",
    visible: true,
    payload: { profileFields: [{ label: "Primary Contact", value: "—" }] },
};

const householdRecord: Record<string, unknown> = {
    "person.primary_contact_name": "Jordan Johnson",
    "person.primary_phone": "555-0100",
    "person.primary_email": "jordan@example.com",
    "person.secondary_contact_name": "Taylor Johnson",
    _inquiry_children: [{ display_name: "Ava Johnson" }, { display_name: "Liam Johnson" }],
};

describe("composeEffectiveCardModel — parity-safe effective model", () => {
    it("returns the same reference when there is nothing to apply", () => {
        expect(composeEffectiveCardModel(baseModel, null, {})).toBe(baseModel);
        expect(composeEffectiveCardModel(baseModel, {}, {})).toBe(baseModel);
        expect(composeEffectiveCardModel(baseModel, { appearance: {} }, {})).toBe(baseModel);
    });

    it("applies card name, description, and size overrides", () => {
        const next = composeEffectiveCardModel(
            baseModel,
            { appearance: { titleOverride: "Family", description: "All contacts", density: "expanded" } },
            {},
        );
        expect(next.title).toBe("Family");
        expect(next.insight).toBe("All contacts");
        expect(next.density).toBe("expanded");
        expect(baseModel.title).toBe("Household"); // pure
    });

    it("rebuilds profile fields from configured business concepts (live binding)", () => {
        const fields: FocusPanelCardField[] = [
            {
                id: "primary_contact",
                label: "Primary Contact",
                concept: "Enrollment → Primary Contact → Name",
                renderer: "relationship_summary",
                kind: "field",
                placement: "collapsed",
            },
            {
                id: "primary_phone",
                label: "Phone",
                concept: "Enrollment → Primary Contact → Phone",
                renderer: "text",
                kind: "field",
                placement: "collapsed",
            },
            {
                id: "secondary",
                label: "Secondary Contact",
                concept: "Enrollment → Secondary Contact → Name",
                renderer: "relationship_summary",
                kind: "field",
                placement: "expanded",
            },
        ];
        const collapsed = composeEffectiveCardModel(baseModel, { fields, expansion: { default: "collapsed" } }, householdRecord);
        expect(collapsed.payload?.profileFields).toEqual([
            { label: "Primary Contact", value: "Jordan Johnson" },
            { label: "Phone", value: "555-0100" },
        ]);

        // Expanded view reveals the expanded-placement field too.
        const expanded = composeEffectiveCardModel(baseModel, { fields, expansion: { default: "expanded" } }, householdRecord);
        expect(expanded.payload?.profileFields?.map((f) => f.label)).toEqual([
            "Primary Contact",
            "Phone",
            "Secondary Contact",
        ]);
    });
});

describe("resolveConceptValue — Household reference", () => {
    it("resolves contacts, phone, email and a children summary", () => {
        expect(resolveConceptValue("Enrollment → Primary Contact → Name", householdRecord)).toBe("Jordan Johnson");
        expect(resolveConceptValue("Enrollment → Primary Contact → Phone", householdRecord)).toBe("555-0100");
        expect(resolveConceptValue("Enrollment → Children → Count", householdRecord)).toBe("2 children");
        expect(resolveConceptValue("Enrollment → Children → Summary", householdRecord)).toBe("Ava Johnson, Liam Johnson");
    });

    it("returns null for concepts with no record value (honest empty state)", () => {
        expect(resolveConceptValue("Enrollment → Emergency Contacts → Summary", householdRecord)).toBeNull();
        expect(resolveConceptValue("Enrollment → Children → Summary", {})).toBeNull();
    });
});

describe("isFocusPanelCardConfigEmpty", () => {
    it("treats blank / default config as empty (not persisted)", () => {
        expect(isFocusPanelCardConfigEmpty(undefined)).toBe(true);
        expect(isFocusPanelCardConfigEmpty({})).toBe(true);
        expect(isFocusPanelCardConfigEmpty({ appearance: { titleOverride: "  " } })).toBe(true);
    });

    it("detects meaningful config", () => {
        expect(isFocusPanelCardConfigEmpty({ appearance: { titleOverride: "Family" } })).toBe(false);
        expect(isFocusPanelCardConfigEmpty({ expansion: { default: "expanded" } })).toBe(false);
        expect(
            isFocusPanelCardConfigEmpty({ conditions: [{ kind: "visible_when", concept: "x", operator: "exists" }] }),
        ).toBe(false);
    });
});

describe("duplicateSummaryCard — card instances", () => {
    it("inserts a unique instance right after the source", () => {
        const householdId = entryInstanceId(baseOrder.find((c) => c.key === "household")!);
        const next = duplicateSummaryCard(baseOrder, householdId);
        expect(next.length).toBe(baseOrder.length + 1);
        const instances = next.filter((c) => c.key === "household");
        expect(instances.length).toBe(2);
        const ids = instances.map((c) => entryInstanceId(c));
        expect(new Set(ids).size).toBe(2);
        expect(ids).toContain("household");
        expect(ids).toContain("household-2");
    });

    it("is a no-op for an unknown instance", () => {
        expect(duplicateSummaryCard(baseOrder, "nope").length).toBe(baseOrder.length);
    });
});

describe("config round-trips through the LayoutDoc", () => {
    it("persists and re-reads per-card config + instance id", () => {
        const householdId = entryInstanceId(baseOrder.find((c) => c.key === "household")!);
        const config: FocusPanelCardConfig = {
            appearance: { titleOverride: "Family", density: "expanded" },
            conditions: [{ kind: "highlighted_when", concept: "Enrollment → Children → Count", operator: "is", value: "2" }],
        };
        const withConfig = updateSummaryCardConfig(baseOrder, householdId, config);
        const doc = buildSummaryDocFromOrder(withConfig);
        const reread = readSummaryCardOrder(doc);
        const household = reread.find((c) => c.key === "household")!;
        expect(household.config?.appearance?.titleOverride).toBe("Family");
        expect(household.config?.conditions?.[0]?.value).toBe("2");

        const map = deriveFocusPanelInstanceMap(doc);
        expect(map.get(householdId)?.typeKey).toBe("household");
        expect(map.get(householdId)?.config?.appearance?.titleOverride).toBe("Family");
    });

    it("default doc carries instance ids equal to the card type (backward compatible)", () => {
        const map = deriveFocusPanelInstanceMap(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(map.get("household")?.typeKey).toBe("household");
        expect(map.get("household")?.config).toBeNull();
    });
});

describe("composition overrides (Experience Builder → engine)", () => {
    it("reduces a card's config to the engine override (only declared fields)", () => {
        const override = compositionOverrideFromConfig({
            composition: { weight: "heavy", perspectiveExpansion: "takeover_row" },
        });
        expect(override).toEqual({ weight: "heavy", perspectiveExpansion: "takeover_row" });
    });

    it("returns null when no composition is declared", () => {
        expect(compositionOverrideFromConfig({ appearance: { titleOverride: "X" } })).toBeNull();
        expect(compositionOverrideFromConfig(null)).toBeNull();
        expect(compositionOverrideFromConfig({ composition: {} })).toBeNull();
    });

    it("builds an overrides map keyed by card type", () => {
        const overrides = buildCompositionOverrides([
            { typeKey: "current_work", config: { composition: { weight: "heavy" } } },
            { typeKey: "children", config: { appearance: { titleOverride: "Kids" } } },
            { typeKey: "readiness_kpi", config: null },
        ]);
        expect(overrides).toEqual({ current_work: { weight: "heavy" } });
    });

    it("counts a composition-only config as non-empty (so it persists)", () => {
        expect(isFocusPanelCardConfigEmpty({ composition: { weight: "light" } })).toBe(false);
        expect(isFocusPanelCardConfigEmpty({ composition: {} })).toBe(true);
    });

    it("persists composition through the LayoutDoc round-trip", () => {
        const id = entryInstanceId(baseOrder.find((c) => c.key === "current_work")!);
        const withComposition = updateSummaryCardConfig(baseOrder, id, {
            composition: { weight: "heavy", preferredRow: "lead" },
        });
        const reread = readSummaryCardOrder(buildSummaryDocFromOrder(withComposition));
        const currentWork = reread.find((c) => c.key === "current_work")!;
        expect(currentWork.config?.composition?.weight).toBe("heavy");
        expect(currentWork.config?.composition?.preferredRow).toBe("lead");
    });
});

describe("Experience Builder composition validation (#9)", () => {
    it("clamps a diagnostic card's depth override back to Evidence (canvas rule)", () => {
        // Readiness is diagnostic — it can never reach Focus/Workspace depth.
        expect(
            clampCompositionOverride("readiness_kpi", { perspectiveExpansion: "takeover_row" }),
        ).toEqual({ perspectiveExpansion: "in_place" });
        expect(
            clampCompositionOverride("current_work", { perspectiveExpansion: "takeover_surface" }),
        ).toEqual({ perspectiveExpansion: "in_place" });
    });

    it("leaves a truth card's depth override intact", () => {
        expect(
            clampCompositionOverride("household", { perspectiveExpansion: "takeover_row" }),
        ).toEqual({ perspectiveExpansion: "takeover_row" });
    });

    it("buildCompositionOverrides clamps invalid depth before it reaches the engine", () => {
        const overrides = buildCompositionOverrides([
            { typeKey: "readiness_kpi", config: { composition: { perspectiveExpansion: "takeover_row" } } },
        ]);
        expect(overrides.readiness_kpi?.perspectiveExpansion).toBe("in_place");
    });

    it("operator weight override round-trips through config and TAKES EFFECT in the engine", () => {
        // Configure Current Work as heavy → it must join the anchor lane on compose.
        const id = entryInstanceId(baseOrder.find((c) => c.key === "current_work")!);
        const order = updateSummaryCardConfig(baseOrder, id, { composition: { weight: "heavy" } });
        const reread = readSummaryCardOrder(buildSummaryDocFromOrder(order));
        const overrides = buildCompositionOverrides(
            reread.map((e) => ({ typeKey: e.key, config: e.config })),
        );
        expect(overrides.current_work?.weight).toBe("heavy");

        const composition = composeFocusPanelSurface({
            cards: reread.map((e) => ({ key: e.instanceId, typeKey: e.key })),
            availableWidthPx: 760,
            overrides,
        });
        const primary = composition.lanes.find((l) => l.role === "primary");
        expect(primary?.cards.map((c) => c.typeKey)).toContain("current_work");
    });
});

describe("Evidence-group config validation (#10)", () => {
    it("treats empty / default config as valid", () => {
        expect(validateFocusPanelCardConfig(undefined).ok).toBe(true);
        expect(validateFocusPanelCardConfig({}).ok).toBe(true);
        expect(validateFocusPanelCardConfig({ appearance: { titleOverride: "Family" } }).ok).toBe(true);
    });

    it("flags a field with no business-concept binding", () => {
        const result = validateFocusPanelCardConfig({
            fields: [{ id: "f1", label: "Phone", concept: "  ", renderer: "text", kind: "field", placement: "collapsed" }],
        });
        expect(result.ok).toBe(false);
        expect(result.issues[0]).toMatchObject({ scope: "field", ref: "f1" });
    });

    it("flags a collection that shows zero rows and a duplicate field id", () => {
        const result = validateFocusPanelCardConfig({
            fields: [
                { id: "c1", label: "Kids", concept: "Enrollment → Children → Summary", renderer: "count_expand", kind: "collection", placement: "collapsed", maxRows: 0 },
                { id: "c1", label: "Kids again", concept: "Enrollment → Children → Summary", renderer: "count_expand", kind: "collection", placement: "collapsed", maxRows: 2 },
            ],
        });
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.message.includes("at least one row"))).toBe(true);
        expect(result.issues.some((i) => i.message.includes("Duplicate"))).toBe(true);
    });

    it("flags a comparison condition missing a value", () => {
        const result = validateFocusPanelCardConfig({
            conditions: [{ kind: "visible_when", concept: "Enrollment → Children → Count", operator: "is" }],
        });
        expect(result.ok).toBe(false);
        expect(result.issues[0]).toMatchObject({ scope: "condition", ref: "0" });
    });

    it("passes a well-formed evidence group + condition", () => {
        const result = validateFocusPanelCardConfig({
            fields: [{ id: "f1", label: "Phone", concept: "Enrollment → Primary Contact → Phone", renderer: "text", kind: "field", placement: "collapsed" }],
            conditions: [{ kind: "visible_when", concept: "Enrollment → Children → Count", operator: "is", value: "2" }],
        });
        expect(result.ok).toBe(true);
        expect(result.issues).toHaveLength(0);
    });
});
