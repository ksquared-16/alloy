import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeWorkspaceHubView } from "@/components/forms/workspace/IntakeWorkspaceHubView";
import { IntakeWorkspaceFilterPanelView } from "@/components/forms/workspace/IntakeWorkspaceFilterPanelView";
import { buildIntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";

describe("IntakeWorkspaceHubView IC-3", () => {
    it("renders case-centric workload filters and contextual panel", () => {
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
                        submitted_at: "2026-05-27T18:09:16.000Z",
                        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                        person_id: "p1",
                        payload: {
                            values: { guardian_full_name: "Jordan Test" },
                            meta: {
                                intake_needs_review: true,
                                intake_resolution_path: "created_records",
                            },
                        },
                    },
                ]}
                packets={[{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Onboarding" }]}
            />
        );

        expect(html).toContain('data-testid="intake-workspace-canvas"');
        expect(html).toContain('data-testid="intake-workload-filters"');
        expect(html).not.toContain('data-testid="intake-latest-submissions"');
        expect(html).toContain('data-testid="intake-workload-browser-debug"');
        expect(html).toContain("Enrollment");
        expect(html).toContain("Intake workspace");
        expect(html).toContain('data-testid="intake-active-filter-needs_review"');
        expect(html).toContain("Jordan Test");
        expect(html).toContain('data-testid="intake-case-row-submission-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"');
        expect(html).toContain("Latest activity ·");
        expect(html).toContain("Review intake and continue enrollment");
        expect(html).not.toContain('data-testid="intake-form-library"');
        expect(html).not.toContain("<table");
    });

    it("shows case-centric empty panel copy when workload is clear", () => {
        const html = renderToStaticMarkup(
            <IntakeWorkspaceHubView viewerTz="UTC" forms={[]} sessions={[]} packets={[]} submissions={[]} />
        );

        expect(html).toContain("Intake is calm");
        expect(html).toContain("No forms in this organization");
    });
});

describe("IntakeWorkspaceFilterPanelView IC-3", () => {
    it("exposes quick review trigger on case row", () => {
        const panel = buildIntakeWorkspaceFilterPanel("needs_review", {
            submissions: [
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    status: "submitted",
                    created_at: "2026-05-01T09:00:00.000Z",
                    submitted_at: "2026-05-27T18:09:16.000Z",
                    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                    person_id: "p1",
                    payload: {
                        meta: { intake_needs_review: true, intake_resolution_path: "created_records" },
                    },
                },
            ],
            sessions: [],
            forms: [{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Waitlist" }],
            packets: [],
            formsById: { "ffffffff-ffff-4fff-8fff-ffffffffffff": "Waitlist" },
        });

        const html = renderToStaticMarkup(
            <IntakeWorkspaceFilterPanelView panel={panel} viewerTz="UTC" />
        );

        expect(html).toContain('data-testid="intake-quick-review-');
        expect(html).toContain("Quick review");
    });
});
