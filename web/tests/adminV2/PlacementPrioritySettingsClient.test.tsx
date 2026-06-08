import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuth: () => ({ role: "admin" }),
}));

describe("PlacementPrioritySettingsClient", () => {
    it("renders operator-facing page title and purpose copy", async () => {
        const PlacementPrioritySettingsClient = (
            await import("@/components/adminV2/settings/PlacementPrioritySettingsClient")
        ).default;

        const html = renderToStaticMarkup(<PlacementPrioritySettingsClient />);
        expect(html).toContain("Waitlist Ranking Policy");
        expect(html).toContain("Choose which families receive priority on the waitlist");
        expect(html).not.toContain("Waitlist priority");
        expect(html).not.toContain("shadow_mode");
    });
});
