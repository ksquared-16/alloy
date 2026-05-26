import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeWorkspaceHubView } from "@/components/forms/workspace/IntakeWorkspaceHubView";

describe("IntakeWorkspaceHubView OW-2", () => {
    it("renders operational lanes and form library without primary table", () => {
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
        expect(html).toContain('data-testid="intake-lane-sessions"');
        expect(html).toContain('data-testid="intake-lane-submissions"');
        expect(html).toContain('data-testid="intake-lane-packets"');
        expect(html).toContain('data-testid="intake-form-library"');
        expect(html).toContain("Review sessions");
        expect(html).toContain("Enrollment");
        expect(html).toContain("Waitlist");
        expect(html).not.toContain("How Forms usually flow");
        expect(html).not.toContain("Forms in Alloy");
        expect(html).not.toContain("<table");
    });

    it("shows operational empty states", () => {
        const html = renderToStaticMarkup(
            <IntakeWorkspaceHubView viewerTz="UTC" forms={[]} sessions={[]} packets={[]} submissions={[]} />
        );

        expect(html).toContain("No packet sessions yet");
        expect(html).toContain("No submissions waiting right now");
        expect(html).toContain("Create a form to start collecting intake");
    });
});
