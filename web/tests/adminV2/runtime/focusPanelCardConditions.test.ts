/**
 * Focus Panel card condition evaluation — composeEffectiveCardModel.
 *
 * Tests that visible_when conditions in FocusPanelCardConfig are evaluated at
 * runtime in composeEffectiveCardModel. Prior to this sprint, conditions were
 * defined and validated but never applied. These tests lock in the runtime
 * behaviour.
 *
 * Covered invariants:
 *   - No conditions → card visible (default)
 *   - visible_when exists → visible when field present, hidden when field absent
 *   - visible_when is → visible when value matches, hidden when it doesn't
 *   - visible_when not_exists → visible when field absent, hidden when present
 *   - Multiple visible_when → ALL must pass (AND logic)
 *   - Other condition kinds (highlighted_when, read_only_when, collapsed_when)
 *     do NOT affect visibility in V1 (they're preserved for future rendering)
 *   - baseModel.visible=false is preserved when no conditions override it
 */

import { describe, expect, it } from "vitest";
import {
    composeEffectiveCardModel,
    type FocusPanelCardConfig,
    type FocusPanelCardCondition,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function baseModel(overrides?: Partial<FocusPanelCardModel>): FocusPanelCardModel {
    return {
        key: "household",
        title: "Household",
        visible: true,
        archetype: "profile",
        payload: { profileFields: [] },
        insight: null,
        density: null,
        primaryAction: null,
        ...overrides,
    } as unknown as FocusPanelCardModel;
}

function configWithConditions(conditions: FocusPanelCardCondition[]): FocusPanelCardConfig {
    return { conditions } as unknown as FocusPanelCardConfig;
}

const RECORD_WITH_EMAIL = { "person.email": "test@example.com", "lifecycle.stage": "active" };
const RECORD_EMPTY = {};

// ── No conditions ─────────────────────────────────────────────────────────────

describe("no conditions — card always visible", () => {
    it("null config → returns baseModel unchanged", () => {
        const model = composeEffectiveCardModel(baseModel(), null, RECORD_EMPTY);
        expect(model.visible).toBe(true);
    });

    it("config with empty conditions array → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });

    it("config with no conditions key → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            {} as FocusPanelCardConfig,
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });
});

// ── visible_when exists ───────────────────────────────────────────────────────

describe("visible_when exists — hides card when field absent", () => {
    const condition: FocusPanelCardCondition = {
        kind: "visible_when",
        concept: "person.email",
        operator: "exists",
    };

    it("field present → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_WITH_EMAIL,
        );
        expect(model.visible).toBe(true);
    });

    it("field absent → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(false);
    });

    it("field is empty string → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "person.email": "" },
        );
        expect(model.visible).toBe(false);
    });

    it("field is dash placeholder → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "person.email": "—" },
        );
        expect(model.visible).toBe(false);
    });
});

// ── visible_when not_exists ───────────────────────────────────────────────────

describe("visible_when not_exists — hides card when field present", () => {
    const condition: FocusPanelCardCondition = {
        kind: "visible_when",
        concept: "person.email",
        operator: "not_exists",
    };

    it("field absent → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });

    it("field present → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_WITH_EMAIL,
        );
        expect(model.visible).toBe(false);
    });
});

// ── visible_when is / is_not ──────────────────────────────────────────────────

describe("visible_when is — hides when value doesn't match", () => {
    const condition: FocusPanelCardCondition = {
        kind: "visible_when",
        concept: "lifecycle.stage",
        operator: "is",
        value: "active",
    };

    it("value matches → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "lifecycle.stage": "active" },
        );
        expect(model.visible).toBe(true);
    });

    it("value doesn't match → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "lifecycle.stage": "closed" },
        );
        expect(model.visible).toBe(false);
    });

    it("field absent → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(false);
    });
});

describe("visible_when is_not — hides when value matches", () => {
    const condition: FocusPanelCardCondition = {
        kind: "visible_when",
        concept: "lifecycle.stage",
        operator: "is_not",
        value: "closed",
    };

    it("value doesn't match → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "lifecycle.stage": "active" },
        );
        expect(model.visible).toBe(true);
    });

    it("value matches → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            { "lifecycle.stage": "closed" },
        );
        expect(model.visible).toBe(false);
    });
});

// ── Multiple conditions (AND) ─────────────────────────────────────────────────

describe("multiple visible_when conditions — AND logic", () => {
    const conditions: FocusPanelCardCondition[] = [
        { kind: "visible_when", concept: "person.email", operator: "exists" },
        { kind: "visible_when", concept: "lifecycle.stage", operator: "is", value: "active" },
    ];

    it("both pass → card visible", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions(conditions),
            { "person.email": "a@b.com", "lifecycle.stage": "active" },
        );
        expect(model.visible).toBe(true);
    });

    it("first fails → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions(conditions),
            { "lifecycle.stage": "active" },
        );
        expect(model.visible).toBe(false);
    });

    it("second fails → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions(conditions),
            { "person.email": "a@b.com", "lifecycle.stage": "closed" },
        );
        expect(model.visible).toBe(false);
    });

    it("both fail → card hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions(conditions),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(false);
    });
});

// ── Non-visibility condition kinds ────────────────────────────────────────────

describe("non-visible_when conditions do not affect visibility", () => {
    it("highlighted_when alone → card visible", () => {
        const condition: FocusPanelCardCondition = {
            kind: "highlighted_when",
            concept: "person.email",
            operator: "exists",
        };
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });

    it("read_only_when alone → card visible", () => {
        const condition: FocusPanelCardCondition = {
            kind: "read_only_when",
            concept: "person.email",
            operator: "exists",
        };
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });

    it("collapsed_when alone → card visible", () => {
        const condition: FocusPanelCardCondition = {
            kind: "collapsed_when",
            concept: "person.email",
            operator: "exists",
        };
        const model = composeEffectiveCardModel(
            baseModel(),
            configWithConditions([condition]),
            RECORD_EMPTY,
        );
        expect(model.visible).toBe(true);
    });
});

// ── baseModel.visible already false ──────────────────────────────────────────

describe("baseModel.visible=false is preserved", () => {
    it("no conditions on hidden card → still hidden", () => {
        const model = composeEffectiveCardModel(
            baseModel({ visible: false }),
            null,
            RECORD_WITH_EMAIL,
        );
        expect(model.visible).toBe(false);
    });
});
