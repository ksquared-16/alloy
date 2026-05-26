import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeWorkspaceHubView } from "@/components/forms/workspace/IntakeWorkspaceHubView";

describe("IntakeWorkspaceHubView FD-1 workload filters", () => {
    it("renders interactive filter strip and inline panel", () => {
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
        expect(html).toContain('data-testid="intake-workload-filters"');
        expect(html).toContain('data-testid="intake-filter-needs_review"');
        expect(html).toContain("Needs review");
        expect(html).not.toContain("Action required");
        expect(html).not.toContain('data-testid="intake-action-queue"');
        expect(html).toContain('data-testid="intake-filter-panel-needs_review"');
    });
});
