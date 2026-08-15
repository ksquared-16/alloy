/**
 * THE NON-NEGOTIABLE INVARIANT.
 *
 *   same subject + same business context + same stage/state
 *     ⇒ the same effective configured card, whichever host renders it.
 *
 * "Both render Child information" is explicitly NOT good enough, so nothing here asserts that a
 * card appeared. Every assertion is on the effective CONFIGURATION — nested-surface key, field keys,
 * configured labels, ordering, visibility, editability — and on the fact that both hosts reach it
 * through the same functions reading the same document.
 *
 * ── WHY THIS TEST CAN BE TRUSTED ──
 *
 * A test that resolved the durable rows twice and compared them to themselves would pass forever and
 * prove nothing. So the "native" side here is read from the real component's source: the assertion
 * that `ChildrenCard.tsx` calls `effectiveChildrenNestedConfig` + `childrenFocusRowsFromNestedConfig`
 * is what ties the value compared below to the card an operator actually sees. If someone gives the
 * native card its own resolution path, that assertion fails — which is the only way this file can
 * keep meaning what it says.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
    contextualCardConfigurationFingerprint,
    contextualChildCardRows,
    resolveContextualChildCard,
} from "@/lib/adminV2/runtime/focusPanel/contextualCard/resolveContextualChildCard";
import {
    childrenFocusRowsFromNestedConfig,
    effectiveChildrenNestedConfig,
} from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";
import { CHILDREN_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

/** Lennon, as the durable grain holds him: a `customer_members` row and nothing more. */
const LENNON: DurableChildSubject = {
    memberId: "cm-lennon",
    personId: null,
    householdId: "cust-kurzman",
    label: "Lennon Kurzman",
    dateOfBirth: "2022-04-11",
    householdName: "Kurzman Family",
    isActive: true,
    truth: {
        customer_member_id: "cm-lennon",
        first_name: "Lennon",
        last_name: "Kurzman",
        dob: "2022-04-11",
        gender: "male",
        allergies: "Peanuts",
        status_key: "waitlisted",
    },
};

/**
 * A tenant publication that differs from the platform default in every way the invariant names:
 * which fields exist, what they are called, and what order they are in.
 *
 * If the durable host quietly fell back to the default — the exact failure the old grain gate
 * caused — this doc is what makes that visible instead of plausible.
 */
function publishedDoc(): LayoutDoc {
    return {
        ...FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
        metadata: {
            ...(FOCUS_PANEL_SUMMARY_DEFAULT_DOC.metadata ?? {}),
            nestedSurfaces: {
                [CHILDREN_SURFACE_ID]: {
                    surfaceId: CHILDREN_SURFACE_ID,
                    groups: [
                        {
                            key: "identity",
                            enabled: true,
                            // Deliberately NOT the default order.
                            selectedFieldKeys: ["child.date_of_birth", "child.first_name", "child.allergies"],
                            fieldLabels: {
                                "child.date_of_birth": "Birthday",
                                "child.first_name": "Given name",
                            },
                            displayOptions: {},
                        },
                    ],
                },
            },
        },
    };
}

describe("the effective configured Child card is the same card in both hosts", () => {
    it("the durable host resolves the tenant publication, not the platform default", () => {
        const doc = publishedDoc();
        const configured = contextualChildCardRows(doc);
        const platformDefault = contextualChildCardRows(null);

        expect(configured.length).toBeGreaterThan(0);
        // The whole point: a published composition must actually change the answer. If these were
        // equal, every assertion below would pass while resolving nothing.
        expect(contextualCardConfigurationFingerprint(configured)).not.toEqual(
            contextualCardConfigurationFingerprint(platformDefault),
        );
    });

    it("field keys, labels, order, visibility and editability are IDENTICAL across hosts", () => {
        const doc = publishedDoc();

        // The native Children card's resolution, verbatim (see ChildrenCard.tsx:270,280).
        const nativeRows = childrenFocusRowsFromNestedConfig(effectiveChildrenNestedConfig(doc));
        // The durable host's resolution.
        const durableRows = contextualChildCardRows(doc);

        // Not "both non-empty" — the same rows, in the same order, with the same metadata.
        expect(durableRows).toEqual(nativeRows);
        expect(contextualCardConfigurationFingerprint(durableRows)).toEqual(
            contextualCardConfigurationFingerprint(nativeRows),
        );
    });

    it("honours the CONFIGURED labels and the CONFIGURED order, not the catalogue's", () => {
        const rows = contextualChildCardRows(publishedDoc());
        const keys = rows.map((r) => r.fieldKey);
        const dobIndex = keys.indexOf("child.date_of_birth");
        const firstNameIndex = keys.indexOf("child.first_name");

        expect(dobIndex).toBeGreaterThanOrEqual(0);
        expect(firstNameIndex).toBeGreaterThanOrEqual(0);
        // Authored order, which is the reverse of how a catalogue would naturally list them.
        expect(dobIndex).toBeLessThan(firstNameIndex);

        expect(rows.find((r) => r.fieldKey === "child.date_of_birth")?.label).toBe("Birthday");
        expect(rows.find((r) => r.fieldKey === "child.first_name")?.label).toBe("Given name");
    });

    it("names the same nested surface the native card is configured on", () => {
        const card = resolveContextualChildCard(publishedDoc(), LENNON, { fromPublishedDoc: true });
        expect(card.nestedSurfaceId).toBe(CHILDREN_SURFACE_ID);
    });

    it("changing the publication changes BOTH hosts, because there is one document", () => {
        const before = publishedDoc();
        const after = publishedDoc();
        const group = (after.metadata!.nestedSurfaces as Record<string, { groups: Array<{ fieldLabels: Record<string, string> }> }>)[
            CHILDREN_SURFACE_ID
        ]!.groups[0]!;
        group.fieldLabels["child.date_of_birth"] = "Date of birth";

        const nativeAfter = childrenFocusRowsFromNestedConfig(effectiveChildrenNestedConfig(after));
        const durableAfter = contextualChildCardRows(after);

        expect(durableAfter).toEqual(nativeAfter);
        expect(contextualCardConfigurationFingerprint(durableAfter)).not.toEqual(
            contextualCardConfigurationFingerprint(contextualChildCardRows(before)),
        );
    });

    it("the NATIVE card still resolves through the shared functions — the tie that makes this real", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/cards/ChildrenCard.tsx"),
            "utf8",
        );
        // If the native card grows its own resolution, the value compared above stops being the one
        // an operator sees and this file becomes a test of itself.
        expect(src).toContain("effectiveChildrenNestedConfig");
        expect(src).toContain("childrenFocusRowsFromNestedConfig");
    });
});

describe("values are read from canonical truth, and absence is honest", () => {
    it("fills what the durable subject canonically owns", () => {
        const card = resolveContextualChildCard(publishedDoc(), LENNON, { fromPublishedDoc: true });
        const byKey = new Map(card.rows.map((r) => [r.fieldKey, r.value]));
        expect(byKey.get("child.first_name")).toBe("Lennon");
        expect(byKey.get("child.allergies")).toBe("Peanuts");
    });

    it("reports the platform default as NOT published, so a host can say which it is showing", () => {
        expect(resolveContextualChildCard(null, LENNON, { fromPublishedDoc: false }).fromPublishedDoc).toBe(
            false,
        );
    });
});
