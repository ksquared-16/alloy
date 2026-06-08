import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DistributionLinksPanel } from "@/components/forms/workspace/DistributionLinksPanel";
import { FormDistributionPanel } from "@/components/forms/workspace/FormDistributionPanel";
import { PacketDistributionLaunchPanel } from "@/components/forms/workspace/PacketDistributionLaunchPanel";

const baseLink = {
    id: "link-1",
    is_active: true,
    created_at: "2026-05-01T10:00:00.000Z",
    metadata: { label: "Family intake", purpose: "Enrollment season" },
};

describe("DistributionLinksPanel OW-7", () => {
    it("renders form mode with operational copy and share action", () => {
        const html = renderToStaticMarkup(
            <DistributionLinksPanel
                mode="form"
                subjectName="Waitlist"
                formKey="waitlist"
                canMutate
                busy={false}
                links={[baseLink]}
                createdLink={null}
                viewerTz="UTC"
                onShareIntake={() => {}}
            />
        );

        expect(html).toContain('data-testid="distribution-links-panel"');
        expect(html).toContain('data-distribution-mode="form"');
        expect(html).toContain("Share intake");
        expect(html).toContain("Active intake links");
        expect(html).toContain("Family intake");
        expect(html).toContain("Enrollment season");
        expect(html).not.toContain("token_prefix");
        expect(html).not.toContain("<table");
    });

    it("renders packet mode with launch action and toggle", () => {
        const html = renderToStaticMarkup(
            <DistributionLinksPanel
                mode="packet"
                subjectName="Onboarding"
                canMutate
                busy={false}
                links={[{ ...baseLink, is_active: false }]}
                createdLink={null}
                viewerTz="UTC"
                onLaunchPacket={() => {}}
                onToggleLink={() => {}}
            />
        );

        expect(html).toContain('data-distribution-mode="packet"');
        expect(html).toContain("Launch packet");
        expect(html).toContain('data-testid="distribution-toggle-link-1"');
        expect(html).toContain("Activate");
    });

    it("shows one-time URL panel with security copy", () => {
        const html = renderToStaticMarkup(
            <DistributionLinksPanel
                mode="form"
                subjectName="Waitlist"
                formKey="waitlist"
                canMutate
                busy={false}
                links={[]}
                createdLink={{
                    embed_path: "/forms/embed/secret-token",
                    embed_url: "https://app.example.com/forms/embed/secret-token",
                    plaintext_token: "secret-token",
                }}
                viewerTz="UTC"
                onShareIntake={() => {}}
                onCopy={() => {}}
            />
        );

        expect(html).toContain('data-testid="distribution-one-time-panel"');
        expect(html).toContain("Copy this link now");
        expect(html).toContain("For security, this exact URL will not be shown again.");
        expect(html).toContain("https://app.example.com/forms/embed/secret-token");
        expect(html).toContain("Advanced — embed credential");
        expect(html.indexOf("Copy this link now")).toBeLessThan(html.indexOf("Advanced — embed credential"));
    });

    it("does not expose secret token as link list identity", () => {
        const html = renderToStaticMarkup(
            <FormDistributionPanel
                formKey="waitlist"
                canMutate
                creating={false}
                createErr={null}
                links={[
                    {
                        ...baseLink,
                        token_prefix: "abc123",
                        pinned_form_definition_version_id: null,
                        expires_at: null,
                    },
                ]}
                createdOnce={null}
                copied={null}
                copyWarn={null}
                viewerTz="UTC"
                onCreateLink={() => {}}
                onCopy={() => {}}
            />
        );

        expect(html).toContain("Family intake");
        expect(html).not.toContain("abc123");
        expect(html).not.toContain("Link · abc123");
    });

    it("preserves packet wrapper test id and launch handler surface", () => {
        const onMint = vi.fn();
        const html = renderToStaticMarkup(
            <PacketDistributionLaunchPanel
                packetName="Onboarding"
                busy={false}
                links={[
                    {
                        ...baseLink,
                        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                        token_prefix: "xyz",
                    },
                ]}
                createdLink={null}
                viewerTz="UTC"
                onMintLink={onMint}
                onToggleLink={() => {}}
            />
        );

        expect(html).toContain('data-testid="packet-distribution-launch-panel"');
        expect(html).toContain('data-testid="distribution-launch-packet"');
        expect(html).not.toContain("xyz");
    });
});
