/**
 * Dev/staging lead drawer v2 org reset helper — pure logic tests.
 */

import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    LEAD_DRAWER_V2_EXPECTED_SECTION_KEYS,
    buildLeadDrawerV2ResetRowMetadata,
    findLatestPublishedOrgDrawerLayout,
    isLeadDrawerV2ResetAlreadyPublished,
    summarizeLeadDrawerLayout,
} from "@/scripts/lib/leadDrawerV2OrgReset";

function record(partial: Partial<EntityLayoutRecord> & Pick<EntityLayoutRecord, "version" | "status">): EntityLayoutRecord {
    return {
        id: partial.id ?? "id",
        orgId: partial.orgId ?? "org",
        industryKey: null,
        entityType: "opportunities",
        surface: "drawer",
        layoutKey: partial.layoutKey ?? "default",
        name: "Lead drawer",
        isSystemDefault: false,
        doc: partial.doc ?? buildLeadDrawerDefaultDoc(),
        metadata: partial.metadata ?? {},
        createdBy: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: null,
        publishedAt: null,
        ...partial,
    };
}

describe("leadDrawerV2OrgReset helpers", () => {
    it("builds reset row metadata with previousVersion when provided", () => {
        expect(buildLeadDrawerV2ResetRowMetadata(13)).toEqual({
            seededFrom: "lead_drawer_v2_reset",
            previousVersion: 13,
            resetReason: "drawer_operating_model_validation",
        });
        expect(buildLeadDrawerV2ResetRowMetadata(null)).toEqual({
            seededFrom: "lead_drawer_v2_reset",
            resetReason: "drawer_operating_model_validation",
        });
    });

    it("finds the highest published default drawer row", () => {
        const rows = [
            record({ id: "v13", version: 13, status: "published", layoutKey: "default" }),
            record({ id: "v12", version: 12, status: "published", layoutKey: "default" }),
            record({ id: "draft", version: 14, status: "draft", layoutKey: "default" }),
            record({ id: "other", version: 99, status: "published", layoutKey: "workflow_v1" }),
        ];
        expect(findLatestPublishedOrgDrawerLayout(rows)?.id).toBe("v13");
    });

    it("detects idempotent reset target rows", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const resetRow = record({
            version: 14,
            status: "published",
            doc,
            metadata: { seededFrom: "lead_drawer_v2_reset", previousVersion: 13 },
        });
        expect(isLeadDrawerV2ResetAlreadyPublished(resetRow)).toBe(true);

        const v13Legacy = record({
            version: 13,
            status: "published",
            doc: {
                ...doc,
                metadata: { seededFrom: "request", template: "lead_drawer_v1" },
            },
            metadata: { seededFrom: "request" },
        });
        expect(isLeadDrawerV2ResetAlreadyPublished(v13Legacy)).toBe(false);
    });

    it("summarizes section keys from lead_drawer_v2 preset", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const summary = summarizeLeadDrawerLayout(
            record({ version: 14, status: "published", doc, metadata: { seededFrom: "lead_drawer_v2_reset" } }),
        );
        expect(summary.docTemplate).toBe("lead_drawer_v2");
        expect(summary.sectionKeys).toEqual([...LEAD_DRAWER_V2_EXPECTED_SECTION_KEYS]);
        expect(summary.isResetTarget).toBe(true);
    });
});
