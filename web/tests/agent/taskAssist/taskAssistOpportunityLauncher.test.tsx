import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import TaskAssistOpportunityLauncher from "@/components/admin/taskAssist/TaskAssistOpportunityLauncher";
import { GlobalAssistantProvider } from "@/contexts/GlobalAssistantContext";

const OPP = "33333333-3333-4333-8333-333333333333";
const launcherPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/taskAssist/TaskAssistOpportunityLauncher.tsx"
);

describe("TaskAssistOpportunityLauncher", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("renders open-assistant control when flag and provider are present", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "true");
        const html = renderToStaticMarkup(
            <GlobalAssistantProvider>
                <TaskAssistOpportunityLauncher entityId={OPP} label="Smith inquiry" />
            </GlobalAssistantProvider>
        );
        expect(html).toContain("data-task-assist-launcher");
        expect(html).toContain("Use assistant for this opportunity");
    });

    it("calls openAssistantWithContext with opportunity drawer context (source contract)", () => {
        const src = readFileSync(launcherPath, "utf8");
        expect(src).toContain("openAssistantWithContext");
        expect(src).toContain('entity_type: "opportunities"');
        expect(src).toContain('source_surface: "opportunity_drawer"');
    });
});
