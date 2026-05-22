import { describe, expect, it } from "vitest";

import {
    CONFIDENCE_LEVELS_V1,
    RECOMMENDATION_TYPES_V1,
    URGENCY_BANDS_V1,
} from "@/lib/adminV2/bos/recommendations/types";
import {
    assertNotGenericCopy,
    BANNED_GENERIC_ACTION_LABELS,
    findGenericCopyIssues,
    RecommendationCatalogValidationError,
    renderCatalogTemplate,
} from "@/lib/adminV2/bos/recommendations/catalog";
import {
    LEGACY_STALE_NEW_INQUIRY_ACTION_LABEL,
    OPERATIONAL_RECOMMENDATION_CATALOG_V1,
    PHASE1_REQUIRED_CATALOG_KEYS,
    renderCatalogEntryCopy,
    WAITING_ON_INTERNAL_CATALOG_KEY,
} from "@/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog";

describe("operationalRecommendationCatalog", () => {
    it("contains all Phase 1 required catalog keys", () => {
        for (const key of PHASE1_REQUIRED_CATALOG_KEYS) {
            expect(OPERATIONAL_RECOMMENDATION_CATALOG_V1[key]).toBeDefined();
            expect(OPERATIONAL_RECOMMENDATION_CATALOG_V1[key]?.catalog_key).toBe(key);
        }
    });

    it("maps waiting_on_internal doctrine to waiting_on_staff", () => {
        expect(WAITING_ON_INTERNAL_CATALOG_KEY).toBe("waiting_on_staff");
        expect(OPERATIONAL_RECOMMENDATION_CATALOG_V1.waiting_on_staff?.title_template).toMatch(/staff/i);
    });

    it("each entry has required templates and valid enums", () => {
        for (const entry of Object.values(OPERATIONAL_RECOMMENDATION_CATALOG_V1)) {
            expect(entry.title_template.trim().length).toBeGreaterThan(0);
            expect(entry.why_it_matters_template.trim().length).toBeGreaterThan(0);
            expect(entry.recommended_action.labelTemplate.trim().length).toBeGreaterThan(0);
            expect(RECOMMENDATION_TYPES_V1).toContain(entry.recommendation_type);
            expect(URGENCY_BANDS_V1).toContain(entry.default_urgency_band);
            expect(CONFIDENCE_LEVELS_V1).toContain(entry.default_confidence_level);
            expect(entry.trust_boundary).toBe("insight_only");
        }
    });

    it("interpolates templates with provided values", () => {
        const rendered = renderCatalogEntryCopy("stale_new_inquiry", {
            primary_label: "New inquiry is stale",
            severity: "medium",
            days: 3,
        });
        expect(rendered.title).toBe("New inquiry needs timely response");
        expect(rendered.why_it_matters).toContain("3 days since intake");
        expect(rendered.recommended_action.label).toContain("warm first response");
        expect(rendered.likely_outcome).toContain("tour");
    });

    it("throws when required interpolation values are missing", () => {
        expect(() =>
            renderCatalogEntryCopy("stale_new_inquiry", {
                severity: "medium",
            })
        ).toThrow(RecommendationCatalogValidationError);
    });

    it("flags generic copy patterns", () => {
        const issues = findGenericCopyIssues("Follow up", "test");
        expect(issues.length).toBeGreaterThan(0);
        expect(() => assertNotGenericCopy("Operational attention: something", "test")).toThrow(
            RecommendationCatalogValidationError
        );
    });

    it("stale_new_inquiry copy is richer than legacy generic labels", () => {
        const rendered = renderCatalogEntryCopy("stale_new_inquiry", {
            primary_label: "New inquiry is stale",
            severity: "medium",
            days: 2,
        });
        expect(rendered.recommended_action.label).not.toBe(LEGACY_STALE_NEW_INQUIRY_ACTION_LABEL);
        expect(BANNED_GENERIC_ACTION_LABELS).not.toContain(rendered.recommended_action.label);
        expect(rendered.why_it_matters.toLowerCase()).not.toContain("operational attention:");
        expect(rendered.why_it_matters.length).toBeGreaterThan(LEGACY_STALE_NEW_INQUIRY_ACTION_LABEL.length);
        expect(rendered.title).not.toMatch(/^respond$/i);
    });

    it("renderCatalogTemplate leaves unknown placeholders unchanged", () => {
        const out = renderCatalogTemplate("Hello {{unknown}}", { primary_label: "X" });
        expect(out).toBe("Hello {{unknown}}");
    });

    it("sla_breach supplemental entry uses escalation type and hints", () => {
        const entry = OPERATIONAL_RECOMMENDATION_CATALOG_V1.sla_breach;
        expect(entry.recommendation_type).toBe("escalation");
        expect(entry.escalation_hints?.applies_when_sla_tier).toBe("breached");
    });

    it("unanswered_inbound supplemental entry is communication-oriented", () => {
        const entry = OPERATIONAL_RECOMMENDATION_CATALOG_V1.unanswered_inbound;
        expect(entry.attention_reason_code).toBeNull();
        expect(entry.recommendation_type).toBe("communication");
        expect(entry.communication_reference_hints?.channel_hint).toBe("sms");
    });
});
