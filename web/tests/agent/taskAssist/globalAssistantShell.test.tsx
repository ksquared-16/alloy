import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import GlobalAssistantShell from "@/app/adminV2/components/globalAssistant/GlobalAssistantShell";
import { GlobalAssistantProvider } from "@/contexts/GlobalAssistantContext";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/globalAssistant/GlobalAssistantShell.tsx"
);

describe("GlobalAssistantShell", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("renders nothing when flag is off", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "false");
        const html = renderToStaticMarkup(
            <GlobalAssistantProvider>
                <GlobalAssistantShell />
            </GlobalAssistantProvider>
        );
        expect(html).toBe("");
    });

    it("renders nothing when closed and flag is on", () => {
        vi.stubEnv("NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED", "true");
        const html = renderToStaticMarkup(
            <GlobalAssistantProvider>
                <GlobalAssistantShell />
            </GlobalAssistantProvider>
        );
        expect(html).toBe("");
    });

    it("uses slide-over shell above drawer z-index (source contract)", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).toContain("data-global-assistant-shell");
        expect(src).toContain("data-global-assistant-backdrop");
        expect(src).toContain('key === "Escape"');
        expect(src).toContain("isTaskAssistV1UiEnabled");
    });
});
