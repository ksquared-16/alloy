import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormLifecycleRail } from "@/components/forms/workspace/FormLifecycleRail";
import { FormDistributionPanel } from "@/components/forms/workspace/FormDistributionPanel";
import { buildFormLifecycleSteps } from "@/lib/forms/formLifecyclePresentation";

describe("FormLifecycleRail OW-3", () => {
    it("renders lifecycle band with step anchors", () => {
        const steps = buildFormLifecycleSteps({
            hasDraft: true,
            hasPublished: true,
            activeLinkCount: 1,
            submissionCount: 2,
            submittedCount: 1,
            documentGenerationConfigured: false,
        });
        const html = renderToStaticMarkup(<FormLifecycleRail steps={steps} />);

        expect(html).toContain('data-testid="form-lifecycle-rail"');
        expect(html).toContain('data-testid="form-lifecycle-step-design"');
        expect(html).toContain('href="#lifecycle-design"');
        expect(html).toContain('href="#lifecycle-publish"');
        expect(html).toContain("Design → Publish → Distribute");
    });
});

describe("FormDistributionPanel OW-3", () => {
    it("renders distribution region without token table", () => {
        const html = renderToStaticMarkup(
            <FormDistributionPanel
                formKey="waitlist"
                canMutate
                creating={false}
                createErr={null}
                links={[
                    {
                        id: "link-1",
                        is_active: true,
                        expires_at: null,
                        token_prefix: "abc123",
                        pinned_form_definition_version_id: null,
                        created_at: "2026-05-01T10:00:00.000Z",
                        metadata: { label: "Family intake" },
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

        expect(html).toContain('data-testid="form-distribution-panel"');
        expect(html).toContain("Family intake");
        expect(html).toContain("Create public link");
        expect(html).not.toContain("<table");
    });
});
