import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import { mapBosRecommendationsToSuccessActions } from "@/lib/admin/actions/mapBosRecommendationsToSuccessActions";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("ActionWorkspaceSuccessState compact layout", () => {
    it("shows top 3 recommendations with expand control for overflow", () => {
        const values = {
            first_name: "Alex",
            last_name: "Lyons",
            child_first_name: "Jaxon",
            child_last_name: "Lyons",
            location_id: "site-1",
        };
        const recommendations = resolveCreateLeadPostCreateRecommendations(values, {
            availableActionKeys: ["schedule_tour", "send_welcome_email"],
        });
        const html = renderToStaticMarkup(
            <ActionWorkspaceSuccessState
                title="Lead Created"
                householdLabel="Alex Lyons Household"
                bosRecommendations={recommendations}
                suggestedActions={mapBosRecommendationsToSuccessActions(recommendations, {
                    onOpenLead: () => undefined,
                })}
                maxVisibleRecommendations={3}
            />,
        );

        expect(html).toContain('data-testid="action-workspace-success-state"');
        expect(html).toContain('data-testid="action-workspace-success-action-open-lead"');
        expect(html).toContain("Open Lead");
        expect(html).toContain("Schedule Tour");
        expect(html).toContain('data-testid="action-workspace-bos-recommendations-expand"');
        expect(html).toMatch(/Show \d+ more/);
    });

    it("uses full-height flex column without legacy min-height centering", () => {
        const html = renderToStaticMarkup(
            <ActionWorkspaceSuccessState title="Lead Created" bosRecommendations={[]} suggestedActions={[]} />,
        );
        expect(html).toContain("flex h-full min-h-0 flex-col");
        expect(html).not.toContain("min-h-[320px]");
    });
});

describe("CreateLeadModal warm open wiring", () => {
    it("prefetches drawer on success instead of auto-handoff timer", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("warmCreateLeadOpportunityDrawer");
        expect(modal).not.toContain("SUCCESS_OPEN_DELAY_MS");
        expect(modal).not.toContain("handoffStartedRef");
    });
});
