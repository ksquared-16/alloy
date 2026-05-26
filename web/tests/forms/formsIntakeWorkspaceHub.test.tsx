import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FormsHubClient from "@/app/admin/forms/FormsHubClient";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/contexts/AdminAuthContext", () => ({
    useAdminAuth: () => ({ canMutate: true, role: "admin" }),
}));

vi.mock("@/contexts/AdminViewerTimezoneContext", () => ({
    useAdminViewerTimezone: () => "America/New_York",
}));

function mockFetch(payloads: Record<string, unknown>) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/admin/forms/packet-sessions")) {
            return { ok: true, json: async () => ({ data: payloads.sessions ?? [] }) };
        }
        if (url.includes("/api/admin/forms/packet-definitions")) {
            return { ok: true, json: async () => ({ data: payloads.packets ?? [] }) };
        }
        if (url.includes("/api/admin/forms/submissions")) {
            return { ok: true, json: async () => ({ data: payloads.submissions ?? [] }) };
        }
        if (url.includes("/api/admin/forms")) {
            return { ok: true, json: async () => ({ data: payloads.forms ?? [] }) };
        }
        return { ok: false, json: async () => ({ error: "not found" }) };
    });
}

describe("FormsHubClient OW-2 intake workspace", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("renders operational lanes instead of primary data table", async () => {
        global.fetch = mockFetch({
            forms: [
                {
                    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                    key: "waitlist",
                    name: "Waitlist",
                    description: null,
                    kind: "center",
                    is_active: true,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: null,
                    has_published_version: true,
                },
            ],
            sessions: [
                {
                    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    status: "completed",
                    created_at: "2026-05-01T10:00:00.000Z",
                    completed_at: "2026-05-01T12:00:00.000Z",
                    form_packet_definitions: { name: "Enrollment" },
                },
            ],
            submissions: [
                {
                    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    status: "submitted",
                    created_at: "2026-05-01T09:00:00.000Z",
                    submitted_at: "2026-05-01T09:30:00.000Z",
                    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                },
            ],
            packets: [
                {
                    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                    name: "Onboarding",
                    is_active: true,
                    updated_at: null,
                },
            ],
        }) as typeof fetch;

        const html = renderToStaticMarkup(<FormsHubClient />);

        expect(html).toContain('data-testid="intake-lane-sessions"');
        expect(html).toContain('data-testid="intake-lane-submissions"');
        expect(html).toContain('data-testid="intake-lane-packets"');
        expect(html).toContain('data-testid="intake-form-library"');
        expect(html).toContain("Review sessions");
        expect(html).toContain("Recent submissions");
        expect(html).toContain("Form library");
        expect(html).not.toContain("How Forms usually flow");
        expect(html).not.toContain("Forms in Alloy");
        expect(html).not.toContain("<table");
        expect(html).toContain("Enrollment");
        expect(html).toContain("Waitlist");
    });

    it("shows operational empty copy when no intake activity", async () => {
        global.fetch = mockFetch({ forms: [], sessions: [], submissions: [], packets: [] }) as typeof fetch;

        const html = renderToStaticMarkup(<FormsHubClient />);

        expect(html).toContain("No packet sessions yet");
        expect(html).toContain("No submissions waiting right now");
        expect(html).toContain("Create a form to start collecting intake");
    });
});
