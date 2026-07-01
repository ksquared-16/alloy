import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PacketSessionsHubClient from "@/app/legacy-admin/forms/PacketSessionsHubClient";
import type { PacketSessionListRow } from "@/app/legacy-admin/forms/PacketSessionsHubClient";

vi.mock("@/contexts/AdminViewerTimezoneContext", () => ({
    useAdminViewerTimezone: () => "UTC",
}));

function session(overrides: Partial<PacketSessionListRow> = {}): PacketSessionListRow {
    return {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        packet_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        packet_name: "Enrollment packet",
        status: "completed",
        created_at: "2026-05-01T10:00:00.000Z",
        completed_at: "2026-05-02T12:00:00.000Z",
        operator_review_status: "needs_review",
        launch_context: { label: "Smith Family · South Campus" },
        step_count: 3,
        submitted_step_count: 3,
        ...overrides,
    };
}

describe("PacketSessionsHubClient OW-5", () => {
    it("renders grouped inbox lanes with review-first emphasis", () => {
        const html = renderToStaticMarkup(
            <PacketSessionsHubClient
                sessions={[
                    session(),
                    session({
                        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                        status: "in_progress",
                        operator_review_status: null,
                        completed_at: null,
                        launch_context: { label: "Jones Family" },
                        submitted_step_count: 1,
                    }),
                    session({
                        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                        operator_review_status: "approved",
                    }),
                ]}
            />
        );

        expect(html).toContain('data-testid="packet-sessions-inbox"');
        expect(html).toContain('data-testid="packet-inbox-lane-needs-review"');
        expect(html).toContain('data-testid="packet-inbox-lane-in-progress"');
        expect(html).toContain('data-testid="packet-inbox-lane-recently-completed"');
        expect(html).toContain("Review case file");
        expect(html).toContain("Continue monitoring");
        expect(html).toContain("Smith Family · South Campus");
        expect(html).not.toContain("<table");
        expect(html.indexOf("Needs review")).toBeLessThan(html.indexOf("In progress"));
    });

    it("action links route to session review page", () => {
        const html = renderToStaticMarkup(<PacketSessionsHubClient sessions={[session()]} />);

        expect(html).toContain(
            'href="/adminV2/forms/packets/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"'
        );
        expect(html).toContain('data-testid="packet-inbox-action-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
    });

    it("renders calm empty states per lane", () => {
        const html = renderToStaticMarkup(<PacketSessionsHubClient sessions={[]} />);

        expect(html).toContain("No packet sessions yet");
    });

    it("shows lane empty copy when sessions exist but lane is empty", () => {
        const html = renderToStaticMarkup(
            <PacketSessionsHubClient
                sessions={[
                    session({
                        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                        status: "in_progress",
                        operator_review_status: null,
                        completed_at: null,
                    }),
                ]}
            />
        );

        expect(html).toContain("No packet sessions need review.");
        expect(html).toContain("Completed sessions will appear here after families submit packets.");
        expect(html).toContain("Smith Family · South Campus");
        expect(html).not.toContain("No packets are currently in progress.");
    });
});
