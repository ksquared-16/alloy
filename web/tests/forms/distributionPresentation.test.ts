import { describe, expect, it } from "vitest";
import {
    DISTRIBUTION_COPY,
    distributionIsPreviewLink,
    distributionLinkLabel,
    distributionLinkPurposeLine,
} from "@/lib/forms/distributionPresentation";

describe("distributionPresentation OW-7", () => {
    it("distributionLinkLabel prefers metadata label over token identity", () => {
        expect(
            distributionLinkLabel(
                {
                    id: "1",
                    is_active: true,
                    created_at: "2026-05-01T10:00:00.000Z",
                    metadata: { label: "Family intake" },
                },
                "Intake link"
            )
        ).toBe("Family intake");
    });

    it("distributionLinkLabel never uses token prefix", () => {
        const label = distributionLinkLabel(
            {
                id: "1",
                is_active: true,
                created_at: "2026-05-01T10:00:00.000Z",
                metadata: {},
            },
            "Intake link"
        );
        expect(label).toBe("Intake link");
        expect(label).not.toContain("abc");
    });

    it("distributionIsPreviewLink detects admin preview metadata", () => {
        expect(
            distributionIsPreviewLink({
                id: "1",
                is_active: true,
                created_at: "2026-05-01T10:00:00.000Z",
                metadata: { alloy_admin_preview: true, label: "Admin preview" },
            })
        ).toBe(true);
    });

    it("distributionLinkPurposeLine reads purpose fields", () => {
        expect(
            distributionLinkPurposeLine({
                id: "1",
                is_active: true,
                created_at: "2026-05-01T10:00:00.000Z",
                metadata: { purpose: "South campus waitlist" },
            })
        ).toBe("South campus waitlist");
    });

    it("DISTRIBUTION_COPY uses operational language", () => {
        expect(DISTRIBUTION_COPY.shareIntake).toBe("Share intake");
        expect(DISTRIBUTION_COPY.copySecurityNote).toContain("will not be shown again");
        expect(DISTRIBUTION_COPY.copyLinkNow).toBe("Copy this link now");
    });
});
