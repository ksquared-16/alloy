import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/contexts/AdminDrawerContext", () => ({
    useAdminDrawer: () => ({ openDrawer: vi.fn() }),
}));

import { IntakeWorkspaceHubView } from "@/components/forms/workspace/IntakeWorkspaceHubView";

describe("IntakeWorkspaceHubView FD-1 workload filters", () => {
    it("renders KPI card navigation and inline panel", () => {
        const html = renderToStaticMarkup(
            <IntakeWorkspaceHubView
                viewerTz="UTC"
                forms={[{ id: "form-1", name: "Waitlist", description: null, has_published_version: true }]}
                sessions={[
                    {
                        id: "sess-1",
                        status: "completed",
                        created_at: "2026-05-03T10:00:00.000Z",
                        packet_name: "Enrollment",
                    },
                ]}
                packets={[{ id: "pkt-1", name: "Enrollment" }]}
                submissions={[
                    {
                        id: "sub-1",
                        status: "submitted",
                        created_at: "2026-05-01T10:00:00.000Z",
                        submitted_at: "2026-05-02T12:00:00.000Z",
                        form_definition_id: "form-1",
                        payload: { meta: { intake_needs_review: true } },
                    },
                ]}
            />
        );

        expect(html).toContain('data-testid="intake-workspace-command-center"');
        expect(html).toContain('data-testid="intake-command-center-kpis"');
        expect(html).toContain('data-testid="intake-kpi-needs-action"');
        expect(html).toContain("Needs Action");
        expect(html).not.toContain('data-testid="intake-workload-filters"');
        expect(html).not.toContain('data-testid="intake-command-orientation"');
        expect(html).not.toContain("need your attention");
        expect(html).not.toContain("Fix next linkage");
        expect(html).not.toContain("Action required");
        expect(html).not.toContain('data-testid="intake-action-queue"');
        expect(html).toContain('data-testid="intake-active-filter-needs_action"');
        expect(html).toContain('data-testid="intake-filter-panel-needs_action"');
    });
});
