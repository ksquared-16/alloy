/**
 * Dev/staging person drawer v2 org reset helper — pure logic tests.
 */

import { describe, expect, it } from "vitest";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS,
    buildPersonDrawerV2ResetRowMetadata,
    findLatestPublishedOrgDrawerLayout,
    isPersonDrawerV2ResetAlreadyPublished,
    summarizePersonDrawerLayout,
} from "@/scripts/lib/personDrawerV2OrgReset";

function record(partial: Partial<EntityLayoutRecord> & Pick<EntityLayoutRecord, "version" | "status">): EntityLayoutRecord {
    return {
        id: partial.id ?? "id",
        orgId: partial.orgId ?? "org",
        industryKey: null,
        entityType: "person",
        surface: "drawer",
        layoutKey: partial.layoutKey ?? "default",
        name: "Person drawer",
        version: partial.version,
        status: partial.status,
        isSystemDefault: false,
        doc: partial.doc ?? buildPersonDrawerDefaultDoc(),
        metadata: partial.metadata ?? {},
        createdBy: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: null,
        publishedAt: null,
        ...partial,
    };
}

describe("personDrawerV2OrgReset helpers", () => {
    it("builds reset row metadata with previousVersion when provided", () => {
        expect(buildPersonDrawerV2ResetRowMetadata(1)).toEqual({
            seededFrom: "person_drawer_v2_reset",
            previousVersion: 1,
            resetReason: "drawer_operating_model_validation",
        });
        expect(buildPersonDrawerV2ResetRowMetadata(null)).toEqual({
            seededFrom: "person_drawer_v2_reset",
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
        const doc = buildPersonDrawerDefaultDoc();
        const resetRow = record({
            version: 2,
            status: "published",
            doc,
            metadata: { seededFrom: "person_drawer_v2_reset", previousVersion: 1 },
        });
        expect(isPersonDrawerV2ResetAlreadyPublished(resetRow)).toBe(true);

        const v1Legacy = record({
            version: 1,
            status: "published",
            doc: {
                ...doc,
                metadata: { seededFrom: "person_default", template: "person_drawer_v1" },
            },
            metadata: { seededFrom: "person_default" },
        });
        expect(isPersonDrawerV2ResetAlreadyPublished(v1Legacy)).toBe(false);
    });

    it("summarizes section keys from person_drawer_v2 preset", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const summary = summarizePersonDrawerLayout(
            record({ version: 2, status: "published", doc, metadata: { seededFrom: "person_drawer_v2_reset" } }),
        );
        expect(summary.docTemplate).toBe("person_drawer_v2");
        expect(summary.sectionKeys).toEqual([...PERSON_DRAWER_V2_EXPECTED_SECTION_KEYS]);
        expect(summary.isResetTarget).toBe(true);
    });
});
