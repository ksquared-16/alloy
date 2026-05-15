import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GlobalAssistantProvider, useGlobalAssistant } from "@/contexts/GlobalAssistantContext";

const contextPath = join(dirname(fileURLToPath(import.meta.url)), "../../../contexts/GlobalAssistantContext.tsx");

function ContextProbe() {
    const { commandSurfaceMode, currentContext } = useGlobalAssistant();
    return (
        <span
            data-global-assistant-probe="true"
            data-command-surface-mode={commandSurfaceMode}
            data-has-context={currentContext ? "true" : "false"}
        />
    );
}

describe("GlobalAssistantContext", () => {
    it("exports provider API for command bar and launcher", () => {
        const src = readFileSync(contextPath, "utf8");
        expect(src).toContain("openAssistantWithContext");
        expect(src).toContain("setAssistantContext");
        expect(src).toContain("closeAssistant");
        expect(src).toContain("focusCommandBar");
        expect(src).toContain("commandSurfaceMode");
        expect(src).toContain("entity_type");
        expect(src).toContain("source_surface");
        expect(src).toContain("commandSurfaceThread");
        expect(src).toContain("clearCommandSurfaceConversation");
        expect(src).toContain("commandSurfaceThreadExpanded");
    });

    it("defaults to job_overview mode with no context", () => {
        const html = renderToStaticMarkup(
            <GlobalAssistantProvider>
                <ContextProbe />
            </GlobalAssistantProvider>
        );
        expect(html).toContain('data-command-surface-mode="job_overview"');
        expect(html).toContain('data-has-context="false"');
    });
});
