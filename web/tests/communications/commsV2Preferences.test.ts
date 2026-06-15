import { describe, expect, it } from "vitest";
import {
    isMarketingCategory,
    preferenceCategoryChannel,
    PREFERENCE_CATEGORIES,
} from "@/lib/communications/v2/preferences";

/** PKG-04 — pure preference taxonomy classifiers (no enforcement). */
describe("preference taxonomy", () => {
    it("flags only marketing categories as marketing", () => {
        expect(isMarketingCategory("email_marketing")).toBe(true);
        expect(isMarketingCategory("sms_marketing")).toBe(true);
        expect(isMarketingCategory("email_transactional")).toBe(false);
        expect(isMarketingCategory("emergency")).toBe(false);
    });
    it("maps categories to channels", () => {
        expect(preferenceCategoryChannel("email_transactional")).toBe("email");
        expect(preferenceCategoryChannel("sms_marketing")).toBe("sms");
        expect(preferenceCategoryChannel("announcements")).toBe("announcement");
        expect(preferenceCategoryChannel("emergency")).toBe("announcement");
    });
    it("classifies every defined category without throwing", () => {
        for (const c of PREFERENCE_CATEGORIES) {
            expect(["email", "sms", "announcement"]).toContain(preferenceCategoryChannel(c));
        }
    });
});
