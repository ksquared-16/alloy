import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeWorkspaceHubView } from "@/components/forms/workspace/IntakeWorkspaceHubView";

describe("IntakeWorkspaceHubView FD-1", () => {
    it("renders workload filters and contextual panel without legacy lanes", () => {
        const html = renderToStaticMarkup(
            <IntakeWorkspaceHubView
                viewerTz="UTC"
                forms={[
                    {
                        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                        name: "Waitlist",
                        description: "Family waitlist",
                        has_published_version: true,
                    },
                ]}
                sessions={[
                    {
                        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                        status: "completed",
                        created_at: "2026-05-01T10:00:00.000Z",
                        packet_name: "Enrollment",
                    },
                ]}
                submissions={[
                    {
                        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        status: "submitted",
                        created_at: "2026-05-01T09:00:00.000Z",
                        submitted_at: "2026-05-01T09:30:00.000Z",
                        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                    },
                ]}
                packets={[{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Onboarding" }]}
            />
        );

        expect(html).toContain('data-testid="intake-workspace-canvas"');
        expect(html).toContain('data-testid="intake-workload-filters"');
        expect(html).toContain("Enrollment");
        expect(html).toContain("Forms");
        expect(html).not.toContain('data-testid="intake-form-library"');
        expect(html).not.toContain("<table");
    });

    it("shows empty panel copy when workload is clear", () => {
        const html = renderToStaticMarkup(
            <IntakeWorkspaceHubView viewerTz="UTC" forms={[]} sessions={[]} packets={[]} submissions={[]} />
        );

        expect(html).toContain("Workload is clear");
        expect(html).toContain("No forms in this organization");
    });
});
