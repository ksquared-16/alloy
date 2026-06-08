/**
 * LayoutRuntimePlanView — inline editable fields (production variant).
 *
 * Fields marked editable on the LayoutDoc become editable ONLY when the host
 * provides onFieldCommit and the field belongs to the writable entity.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import { LAYOUT_DOC_FORMAT_VERSION, type LayoutDoc } from "@/lib/layout/layoutV2";

function docWithEditableName(): LayoutDoc {
    return {
        formatVersion: LAYOUT_DOC_FORMAT_VERSION,
        surface: "drawer",
        entityType: "opportunities",
        sections: [
            {
                id: "s1",
                key: "summary",
                title: "Summary",
                rows: [
                    {
                        id: "r1",
                        columns: [
                            {
                                id: "c1",
                                width: 12,
                                items: [
                                    { id: "f1", kind: "field", refKey: "opportunity.name", label: "Name", renderHint: "text", editable: true },
                                    { id: "f2", kind: "field", refKey: "opportunity.source", label: "Source", renderHint: "text" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe("LayoutRuntimePlanView editable fields", () => {
    const record = { id: "opp-1", name: "Smith Lead", source: "Referral" };

    it("renders an editable affordance for editable fields when onFieldCommit is provided", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView
                doc={docWithEditableName()}
                record={record}
                variant="production"
                onFieldCommit={() => {}}
                editableEntity="opportunity"
            />,
        );
        expect(html).toContain('data-layout-runtime-field-editable="true"');
        expect(html).toContain("Smith Lead");
        // Non-editable field (source) is not turned into an editable control beyond the one editable field.
        expect(html.match(/data-layout-runtime-field-editable/g)?.length).toBe(1);
    });

    it("stays read-only when no onFieldCommit is provided", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimePlanView doc={docWithEditableName()} record={record} variant="production" />,
        );
        expect(html).not.toContain("data-layout-runtime-field-editable");
        expect(html).toContain("Smith Lead");
    });
});
