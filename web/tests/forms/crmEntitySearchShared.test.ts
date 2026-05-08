import { describe, expect, it } from "vitest";
import {
    CRM_SEARCH_ENTITY_TYPES,
    effectiveManualLinkUuid,
    isCrmSearchEntityType,
    sanitizeCrmSearchToken,
} from "@/lib/admin/forms/crmEntitySearchShared";

describe("crmEntitySearchShared", () => {
    it("sanitizeCrmSearchToken strips risky chars", () => {
        expect(sanitizeCrmSearchToken("ada_%")).toBe("ada");
        expect(sanitizeCrmSearchToken('  "(test)"  ')).toBe("test");
    });

    it("isCrmSearchEntityType validates known kinds", () => {
        expect(isCrmSearchEntityType("person")).toBe(true);
        expect(isCrmSearchEntityType("customer_member")).toBe(true);
        expect(isCrmSearchEntityType("bogus")).toBe(false);
        expect(CRM_SEARCH_ENTITY_TYPES.length).toBe(4);
    });

    it("effectiveManualLinkUuid prefers manual paste", () => {
        expect(effectiveManualLinkUuid("manual-id", "picked-id")).toBe("manual-id");
        expect(effectiveManualLinkUuid("", "picked-id")).toBe("picked-id");
        expect(effectiveManualLinkUuid("  ", undefined)).toBeUndefined();
    });
});
