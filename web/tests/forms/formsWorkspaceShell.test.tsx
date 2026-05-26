import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormsModuleNav } from "@/components/forms/workspace/FormsModuleNav";
import { FormsWorkspaceChrome } from "@/components/forms/workspace/FormsWorkspaceChrome";
import { FormsWorkspaceShell } from "@/components/forms/workspace/FormsWorkspaceShell";

vi.mock("next/navigation", () => ({
    usePathname: () => "/adminV2/forms/packets",
}));

describe("FormsWorkspaceShell OW-1", () => {
    it("renders chrome with module nav and intake operations label", () => {
        const html = renderToStaticMarkup(
            <FormsWorkspaceChrome>
                <p>Page body</p>
            </FormsWorkspaceChrome>
        );
        expect(html).toContain('data-testid="forms-workspace-chrome"');
        expect(html).toContain('data-testid="forms-module-nav"');
        expect(html).toContain("Intake operations");
        expect(html).toContain("Page body");
    });

    it("marks sessions nav active on packet sessions path", () => {
        const html = renderToStaticMarkup(<FormsModuleNav />);
        expect(html).toContain('data-nav-key="sessions"');
        expect(html).toContain('data-active="true"');
        expect(html).toContain("Sessions");
    });

    it("renders operational page header inside shell", () => {
        const html = renderToStaticMarkup(
            <FormsWorkspaceShell title="Intake workspace" subtitle="Compose and review.">
                <p>Content</p>
            </FormsWorkspaceShell>
        );
        expect(html).toContain('data-testid="forms-workspace-shell"');
        expect(html).toContain('data-testid="operational-page-header"');
        expect(html).toContain("Intake workspace");
        expect(html).toContain("Compose and review.");
    });

    it("renders breadcrumbs when provided", () => {
        const html = renderToStaticMarkup(
            <FormsWorkspaceShell
                title="Form"
                breadcrumbs={[
                    { label: "Intake operations", href: "/adminV2/forms" },
                    { label: "Waitlist" },
                ]}
            >
                <p>Body</p>
            </FormsWorkspaceShell>
        );
        expect(html).toContain('data-testid="forms-breadcrumbs"');
        expect(html).toContain("Waitlist");
    });
});
