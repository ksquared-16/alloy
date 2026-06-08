/**
 * Layout runtime editability — person-contact fields only; header save required.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimeDrawerEditProvider from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

function fieldDoc(refKey: string, editable: boolean): LayoutDoc {
    return {
        formatVersion: 1,
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
                                    {
                                        id: "f1",
                                        kind: "field",
                                        refKey,
                                        label: "Field",
                                        renderHint: "text",
                                        editable,
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    } as LayoutDoc;
}

describe("layout runtime editability", () => {
    it("renders read-only value when editable is false", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeDrawerBodyView
                doc={fieldDoc("opportunity.source", false)}
                record={{ "opportunity.source": "Web" }}
            />,
        );
        expect(html).toContain("Web");
        expect(html).not.toContain("data-layout-runtime-editable");
    });

    it("does not render editable input for unsupported refKeys even when editable is true", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeDrawerEditProvider record={{ "opportunity.source": "Web" }}>
                <LayoutRuntimeDrawerBodyView
                    doc={fieldDoc("opportunity.source", true)}
                    record={{ "opportunity.source": "Web" }}
                />
            </LayoutRuntimeDrawerEditProvider>,
        );
        expect(html).toContain("Web");
        expect(html).not.toContain("data-layout-runtime-editable");
    });

    it("renders editable input for person-contact refKeys with edit provider", () => {
        const html = renderToStaticMarkup(
            <LayoutRuntimeDrawerEditProvider
                record={{
                    "person.first_name": "Jamie",
                    "opportunity.primary_person_id": "p-1",
                }}
            >
                <LayoutRuntimeDrawerBodyView
                    doc={fieldDoc("person.first_name", true)}
                    record={{
                        "person.first_name": "Jamie",
                        "opportunity.primary_person_id": "p-1",
                    }}
                />
            </LayoutRuntimeDrawerEditProvider>,
        );
        expect(html).toContain('data-layout-runtime-editable="true"');
        expect(html).toContain('value="Jamie"');
    });
});
