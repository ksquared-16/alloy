import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import {
    buildCrmQueueRowPreviewPresentation,
    parseQueueRowCrmChildrenStructured,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { extractQueueRowRelatedDrawerTargets, resolveQueueRowRelatedDrawerPersonIds } from "@/lib/workspace/viewModels/queueRowRelatedDrawerTargets";

describe("queueRowRelatedDrawerTargets", () => {
    it("extracts primary person and first inquiry child person ids", () => {
        const targets = extractQueueRowRelatedDrawerTargets(
            {
                id: "opp-1",
                primary_person_id: "person-parent",
                metadata: {
                    inquiry_children: [{ person_id: "child-1", display_name: "Sam" }],
                },
            },
            "opp-1"
        );
        expect(targets.personId).toBe("person-parent");
        expect(targets.childPersonId).toBe("child-1");
    });

    it("prefers server-enriched child person id and member children", () => {
        const fromMembers = resolveQueueRowRelatedDrawerPersonIds({
            primaryPersonId: "parent-1",
            activeMemberChildren: [{ person_id: "child-member-1" }],
        });
        expect(fromMembers.childPersonId).toBe("child-member-1");

        const fromEnriched = resolveQueueRowRelatedDrawerPersonIds({
            primaryPersonId: "parent-1",
            primaryChildPersonId: "child-enriched",
        });
        expect(fromEnriched.childPersonId).toBe("child-enriched");
    });
});

describe("queue row CRM compact person ids", () => {
    it("parses person_id on structured child lines", () => {
        const lines = parseQueueRowCrmChildrenStructured([
            { primary: "Alex (5y)", person_id: "child-alex" },
            { primary: "Jordan", personId: "child-jordan" },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0]?.personId).toBe("child-alex");
        expect(lines[1]?.personId).toBe("child-jordan");
    });

    it("derives contactPersonId from _primary_person_id", () => {
        const presentation = buildCrmQueueRowPreviewPresentation(
            {
                _primary_contact_line: "Ada Lovelace · ada@example.com",
                _primary_person_id: "person-ada",
            },
            (f) => f === "primary_contact" || f === "email"
        );
        expect(presentation.contactPersonId).toBe("person-ada");
        expect(presentation.contactDisplayName).toBe("Ada Lovelace");
    });
});

describe("CrmCompactQueuePreview inline drawer icons", () => {
    const handlers = {
        onOpenPerson: vi.fn(),
        onOpenChild: vi.fn(),
        onPrefetchPerson: vi.fn(),
        onPrefetchChild: vi.fn(),
    };

    it("renders person icon to the left of contact name in a framed row band", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                drawerRecordIconHandlers={handlers}
                slots={{
                    primaryIdentity: "Smith Family",
                    crmFactGroups: [
                        {
                            kind: "contact",
                            label: "",
                            columnGrid: {
                                headers: ["Contact", "Phone", "Email"],
                                rows: [["Ada Lovelace", "555-0100", "ada@example.com"]],
                                columnKeys: ["primary_contact", "phone", "email"],
                            },
                        },
                    ],
                    contactPersonId: "person-ada",
                    contactDisplayName: "Ada Lovelace",
                }}
            />
        );
        expect(html).toContain('data-queue-related-record-layout="row_band"');
        expect(html).toContain('data-queue-related-record-row="person"');
        expect(html).toContain('data-queue-row-person-icon="true"');
        expect(html).toContain("Ada Lovelace");
        expect(html).toContain("555-0100");
        expect(html).toMatch(/data-queue-row-person-icon="true"[\s\S]*<span class="adminv2-ws-queue-related-record-name">Ada Lovelace<\/span>/);
    });

    it("renders child rows as horizontal bands with icon left of name and program field", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                drawerRecordIconHandlers={handlers}
                slots={{
                    primaryIdentity: "Smith Family",
                    crmFactGroups: [
                        {
                            kind: "children_programs",
                            label: "",
                            columnGrid: {
                                headers: ["Child", "Program"],
                                rows: [
                                    ["Alex (5y)", "Toddler"],
                                    ["Jordan", "Preschool"],
                                ],
                                columnKeys: ["child_name", "program"],
                            },
                        },
                    ],
                    childrenLines: [
                        { primary: "Alex (5y)", personId: "child-alex", programInline: "Toddler" },
                        { primary: "Jordan", personId: "child-jordan", programInline: "Preschool" },
                    ],
                }}
            />
        );
        expect(html).toContain('data-queue-related-record-layout="row_band"');
        expect(html).toContain('data-queue-related-record-row="child"');
        expect(html).toContain('data-queue-row-child-icon="true"');
        expect(html).toContain("Toddler");
        expect(html).toContain("Preschool");
        expect(html).toMatch(/data-queue-row-child-icon="true"[\s\S]*<span class="adminv2-ws-queue-related-record-name">Alex \(5y\)<\/span>/);
    });

    it("does not render icons without person ids", () => {
        const html = renderToStaticMarkup(
            <CrmCompactQueuePreview
                scanMode
                drawerRecordIconHandlers={handlers}
                slots={{
                    primaryIdentity: "Smith Family",
                    crmFactGroups: [
                        {
                            kind: "contact",
                            label: "",
                            columnGrid: {
                                headers: ["Contact"],
                                rows: [["Ada Lovelace"]],
                                columnKeys: ["primary_contact"],
                            },
                        },
                    ],
                    contactDisplayName: "Ada Lovelace",
                }}
            />
        );
        expect(html).not.toContain('data-queue-row-person-icon="true"');
        expect(html).not.toContain('data-testid="view-person-drawer-open"');
    });
});

describe("QueueBlock row/icon propagation wiring", () => {
    it("uses shared ViewPersonDrawerIconButton inline and removes generic row-level P/C actions", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const queueBlock = readFileSync(
            join(webRoot, "app/adminV2/components/workspace/blocks/QueueBlock.tsx"),
            "utf8"
        );
        expect(queueBlock).toContain('actionId: "open_record"');
        expect(queueBlock).toContain('actionId: "open_person_drawer"');
        expect(queueBlock).toContain('actionId: "open_child_drawer"');
        expect(queueBlock).toContain("e.stopPropagation()");
        expect(queueBlock).toContain("ViewPersonDrawerIconButton");
        expect(queueBlock).toContain("CrmFactRelatedRecordRows");
        expect(queueBlock).toContain("adminv2-ws-queue-related-record-row");
        expect(queueBlock).not.toContain('data-queue-related-record-icons="true"');
    });

    it("handles person/child drawer actions on work unit page", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const page = readFileSync(
            join(
                webRoot,
                "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
            ),
            "utf8"
        );
        expect(page).toContain('action.actionId === "open_person_drawer"');
        expect(page).toContain('action.actionId === "open_child_drawer"');
        expect(page).toContain("openWorkUnitQueuePersonDrawer");
        expect(page).toContain("openWorkUnitQueueChildDrawer");
        expect(page).toContain("contactPersonId");
        expect(page).toContain("childPersonId");
    });
});
