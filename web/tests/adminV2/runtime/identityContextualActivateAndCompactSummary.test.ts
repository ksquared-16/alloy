/**
 * Focus Panel polish — contextual activate labels + compact identity summary projection.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveCompactIdentitySummaryLabelMode } from "@/lib/adminV2/runtime/focusPanel/identity/resolveCompactIdentitySummaryLabelMode";
import { resolveIdentityContextualActivateAction } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityContextualActivateAction";
import { resolveIdentityFieldLinkContract } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import type { IdentityRecordVM } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

function recordWithLinkedCells(
    cells: Array<{
        fieldRef: string;
        label?: string;
        linked?: boolean;
        linkLabel?: string | null;
        linkDestination?: IdentityRecordVM["summaryRows"][number]["cells"][number]["linkDestination"];
    }>,
): IdentityRecordVM {
    return {
        id: "child-1",
        title: "Lennon",
        summaryRows: [
            {
                row: 0,
                cells: cells.map((cell) => ({
                    fieldRef: cell.fieldRef,
                    label: cell.label ?? cell.fieldRef,
                    value: "sample",
                    labelMode: "hidden" as const,
                    policy: cell.linked === false ? ("read-only" as const) : ("linked" as const),
                    editable: false,
                    linked: cell.linked !== false,
                    linkLabel: cell.linkLabel ?? null,
                    linkDestination: cell.linkDestination ?? null,
                    hideWhenEmpty: false,
                    width: "full" as const,
                })),
            },
        ],
        contextFactRows: [],
        contextRows: [],
        detailRows: [],
        detailsRows: [],
        expandedRows: [],
        canShowDetails: false,
        canExpand: false,
    };
}

describe("resolveIdentityContextualActivateAction", () => {
    it("prefers Assignments → for linked scheduling fields", () => {
        const action = resolveIdentityContextualActivateAction(
            recordWithLinkedCells([
                {
                    fieldRef: "inquiry_child.schedule_type",
                    label: "Schedule",
                    linkLabel: "Assignments",
                    linkDestination: "scheduling",
                },
            ]),
        );
        expect(action).toEqual({
            fieldRef: "inquiry_child.schedule_type",
            label: "Assignments →",
            destination: "scheduling",
        });
    });

    it("labels household / communications destinations contextually (not Details)", () => {
        expect(
            resolveIdentityContextualActivateAction(
                recordWithLinkedCells([
                    {
                        fieldRef: "person.household",
                        linkDestination: "household",
                        linkLabel: "Household",
                    },
                ]),
            )?.label,
        ).toBe("View household →");

        expect(
            resolveIdentityContextualActivateAction(
                recordWithLinkedCells([
                    {
                        fieldRef: "person.contacts",
                        linkDestination: "communications",
                        linkLabel: "Contacts",
                    },
                ]),
            )?.label,
        ).toBe("Contacts →");
    });

    it("returns null when no Linked navigation is configured (no generic Details fallback)", () => {
        expect(
            resolveIdentityContextualActivateAction(
                recordWithLinkedCells([{ fieldRef: "person.email", linked: false }]),
            ),
        ).toBeNull();
    });
});

describe("resolveCompactIdentitySummaryLabelMode", () => {
    it("hides redundant name/email/phone labels in summary when unauthored", () => {
        expect(
            resolveCompactIdentitySummaryLabelMode({
                fieldRef: "person.email",
                authoredLabelMode: "visible",
                purpose: "summary",
                treatResolvedVisibleAsUnauthored: true,
            }),
        ).toBe("hidden");
        expect(
            resolveCompactIdentitySummaryLabelMode({
                fieldRef: "person.first_name",
                authoredLabelMode: null,
                purpose: "summary",
            }),
        ).toBe("hidden");
        expect(
            resolveCompactIdentitySummaryLabelMode({
                fieldRef: "person.email",
                authoredLabelMode: "visible",
                purpose: "summary",
                treatResolvedVisibleAsUnauthored: false,
            }),
        ).toBe("visible");
    });

    it("does not rewrite details/context purposes", () => {
        expect(
            resolveCompactIdentitySummaryLabelMode({
                fieldRef: "person.email",
                authoredLabelMode: null,
                purpose: "details",
            }),
        ).toBe("visible");
    });
});

describe("linked identity field presentation polish", () => {
    it("destination-aware link labels omit generic Open/Details", () => {
        expect(resolveIdentityFieldLinkContract("child.schedule").linkLabel).toBe("Assignments");
        expect(resolveIdentityFieldLinkContract("inquiry_child.start_date").linkLabel).toBe("Assignments");
    });

    it("IdentityFieldValue uses inline nav cue without separate Open button or underline-everything", () => {
        const field = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        const css = readFileSync(
            join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        expect(field).toContain("identity-field-value__nav-cue");
        expect(field).toContain("→");
        expect(field).not.toMatch(/>\s*Open\s*</);
        expect(css).toContain(".identity-field-value__nav-cue");
        expect(css).toMatch(
            /\.identity-field-value--linked:hover \.identity-field-value__value--linked[\s\S]*?text-decoration:\s*none/,
        );
    });

    it("compact icons render inline in the value row (not stacked above)", () => {
        const field = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        const valueRowIdx = field.indexOf('className="identity-field-value__value-row"');
        const soloIconIdx = field.indexOf("identity-field-value__icon--solo");
        expect(valueRowIdx).toBeGreaterThan(-1);
        expect(soloIconIdx).toBeGreaterThan(valueRowIdx);
        // Solo icon must not appear as a sibling above the value row.
        const beforeValueRow = field.slice(0, valueRowIdx);
        expect(beforeValueRow).not.toContain("identity-field-value__icon--solo");
    });

    it("IdentityRecordSummary does not render Schedule → / Details → footer actions", () => {
        const summary = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityRecordSummary.tsx"),
            "utf8",
        );
        expect(summary).not.toContain("Schedule →");
        expect(summary).not.toContain("Assignments →");
        expect(summary).not.toContain("Details →");
        expect(summary).not.toContain("resolveIdentityContextualActivateAction");
        expect(summary).not.toContain("data-identity-open-details");
    });

    it("compact summary hides empty placeholders via pre-pack filter (no lone — between phone/email)", () => {
        const resolver = readFileSync(
            join(process.cwd(), "lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows.ts"),
            "utf8",
        );
        expect(resolver).toContain('labelMode ?? "visible") === "hidden"');
        expect(resolver).toContain("hideWhenEmpty");
        const field = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        // Late nulls left pair/triple holes — filtering belongs in the shared row resolver.
        expect(field).not.toContain("if (hideEmpty) return null");
    });
});
