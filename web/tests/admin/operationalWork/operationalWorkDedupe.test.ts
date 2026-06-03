import { describe, expect, it } from "vitest";

import {
    buildOperationalWorkDedupeKey,
    buildOperationalWorkSubjectFingerprint,
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    resolveOperationalWorkDedupePolicy,
    shouldDedupeOperationalWork,
} from "@/lib/admin/operationalWork/operationalWorkDedupe";

const orgId = "11111111-1111-4111-8111-111111111111";
const oppId = "33333333-3333-4333-8333-333333333333";

describe("operationalWorkDedupe", () => {
    it("builds subject fingerprint for linked opportunity", () => {
        expect(
            buildOperationalWorkSubjectFingerprint({
                orgId,
                entityType: "opportunities",
                entityId: oppId,
            }),
        ).toBe(`${orgId}:opportunities:${oppId}`);
    });

    it("builds unlinked fingerprint", () => {
        expect(buildOperationalWorkSubjectFingerprint({ orgId, entityType: null, entityId: null })).toBe(`${orgId}:unlinked`);
    });

    it("honors explicit subjectFingerprint override", () => {
        expect(
            buildOperationalWorkSubjectFingerprint({
                orgId,
                entityType: "opportunities",
                entityId: oppId,
                subjectFingerprint: "custom",
            }),
        ).toBe("custom");
    });

    it("builds dedupe key with optional period", () => {
        const fp = `${orgId}:opportunities:${oppId}`;
        expect(
            buildOperationalWorkDedupeKey({
                orgId,
                workDefinitionKey: "collect_missing_information",
                subjectFingerprint: fp,
            }),
        ).toBe(`${orgId}|collect_missing_information|${fp}`);
        expect(
            buildOperationalWorkDedupeKey({
                orgId,
                workDefinitionKey: "collect_missing_information",
                subjectFingerprint: fp,
                periodKey: "2026-W23",
            }),
        ).toBe(`${orgId}|collect_missing_information|${fp}|2026-W23`);
    });

    it("uses weak dedupe for manual ad hoc", () => {
        expect(
            resolveOperationalWorkDedupePolicy({
                workDefinitionKey: MANUAL_AD_HOC_WORK_DEFINITION_KEY,
            }),
        ).toBe("none");
        expect(shouldDedupeOperationalWork("none")).toBe(false);
    });

    it("uses strong dedupe for definition-backed work", () => {
        expect(
            resolveOperationalWorkDedupePolicy({
                workDefinitionKey: "follow_up_after_tour",
            }),
        ).toBe("definition_subject");
        expect(
            resolveOperationalWorkDedupePolicy({
                workDefinitionKey: "resolve_outstanding_balance",
                periodKey: "2026-06",
            }),
        ).toBe("definition_subject_period");
    });
});
