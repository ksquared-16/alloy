import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalAssistantPanelRouter from "@/app/adminV2/components/globalAssistant/GlobalAssistantPanelRouter";

const OPP = "33333333-3333-4333-8333-333333333333";

describe("GlobalAssistantPanelRouter", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("renders opportunity workspace for opportunities context", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "true");
        const html = renderToStaticMarkup(
            <GlobalAssistantPanelRouter
                active
                context={{
                    entity_type: "opportunities",
                    entity_id: OPP,
                    label: "Test opp",
                    source_surface: "header",
                }}
            />
        );
        expect(html).toContain("data-task-assist-v1-root");
        expect(html).toContain("Draft with Task Assist");
    });
});
