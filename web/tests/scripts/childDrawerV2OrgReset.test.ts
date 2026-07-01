/**
 * Dev/staging child drawer v2 org reset helper — pure logic tests.
 */

import { describe, expect, it } from "vitest";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    CHILD_DRAWER_V2_EXPECTED_SECTION_KEYS,
    buildChildDrawerV2ResetRowMetadata,
    findLatestPublishedOrgDrawerLayout,
    isChildDrawerV2ResetAlreadyPublished,
    summarizeChildDrawerLayout,
} from "@/scripts/lib/childDrawerV2OrgReset";

function record(partial: Partial<EntityLayoutRecord> & Pick<EntityLayoutRecord, "version" | "status">): EntityLayoutRecord {
    return {
        id: partial.id ?? "id",
        orgId: partial.orgId ?? "org",
        industryKey: null,
        entityType: "child",
        surface: "drawer",
        layoutKey: partial.layoutKey ?? "default",
        name: "Child drawer",
        isSystemDefault: false,
        doc: partial.doc ?? buildChildDrawerDefaultDoc(),
        metadata: partial.metadata ?? {},
        createdBy: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: null,
        publishedAt: null,
        ...partial,
    };
}

describe("childDrawerV2OrgReset helpers", () => {
    it("builds reset row metadata with previousVersion when provided", () => {
        expect(buildChildDrawerV2ResetRowMetadata(1)).toEqual({
            seededFrom: "child_drawer_v2_reset",
            previousVersion: 1,
            resetReason: "drawer_operating_model_validation",
        });
        expect(buildChildDrawerV2ResetRowMetadata(null)).toEqual({
            seededFrom: "child_drawer_v2_reset",
            resetReason: "drawer_operating_model_validation",
        });
    });

    it("finds the highest published default drawer row", () => {
        const rows = [
            record({ id: "v2", version: 2, status: "published", layoutKey: "default" }),
            record({ id: "v1", version: 1, status: "published", layoutKey: "default" }),
            record({ id: "draft", version: 3, status: "draft", layoutKey: "default" }),
        ];
        expect(findLatestPublishedOrgDrawerLayout(rows)?.id).toBe("v2");
    });

    it("detects idempotent reset target rows", () => {
        const doc = buildChildDrawerDefaultDoc();
        const resetRow = record({
            version: 2,
            status: "published",
            doc,
            metadata: { seededFrom: "child_drawer_v2_reset", previousVersion: 1 },
        });
        expect(isChildDrawerV2ResetAlreadyPublished(resetRow)).toBe(true);

        const v1Legacy = record({
            version: 1,
            status: "published",
            doc: {
                ...doc,
                sections: doc.sections.filter((s) => s.key !== "program_enrollment"),
                metadata: { seededFrom: "child_default", template: "child_drawer_v1" },
            },
            metadata: { seededFrom: "child_default" },
        });
        expect(isChildDrawerV2ResetAlreadyPublished(v1Legacy)).toBe(false);
    });

    it("summarizes section keys from child_drawer_v2 preset", () => {
        const doc = buildChildDrawerDefaultDoc();
        const summary = summarizeChildDrawerLayout(
            record({ version: 2, status: "published", doc, metadata: { seededFrom: "child_drawer_v2_reset" } }),
        );
        expect(summary.docTemplate).toBe("child_drawer_v2");
        expect(summary.sectionKeys).toEqual([...CHILD_DRAWER_V2_EXPECTED_SECTION_KEYS]);
        expect(summary.isResetTarget).toBe(true);
    });
});
