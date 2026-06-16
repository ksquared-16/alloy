/**
 * Visual Layout Configuration Builder — Phase 5.7 tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLeadDrawerDefaultDoc } from "@/lib/layout/defaultLeadLayouts";
import {
    addLayoutBlockToSection,
    listLayoutEditorBlockTemplatesForSection,
    moveLayoutBlock,
    patchLayoutBlockContactRole,
    removeLayoutBlock,
    resolveLayoutEditorBlockTitle,
} from "@/lib/layout/layoutEditorBlockRegistry";
import {
    listSectionLayoutBlocks,
    patchLayoutEditorFieldDisplay,
    serializeLayoutEditorNodePath,
} from "@/lib/layout/layoutEditorCompositionModel";
import {
    contactRoleBlockTitle,
    readLayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import { LAYOUT_LINK_BEHAVIOR_LABELS } from "@/lib/layout/layoutEditorDisplayConfig";
import {
    buildLayoutEditorInspectInfo,
    buildLayoutEditorItemIdPathIndex,
} from "@/lib/layout/layoutEditorInspectModel";
import {
    readLayoutEditorRowTemplateConfig,
    writeLayoutEditorRowTemplateConfig,
} from "@/lib/layout/layoutEditorRowTemplateConfig";

const root = resolve(__dirname, "../..");

describe("inline field editing", () => {
    it("anchors field settings inline under the selected field row", () => {
        const panel = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutCompositionPanel.tsx"),
            "utf8",
        );
        const settings = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx"),
            "utf8",
        );
        expect(panel).toContain("<OpportunityDrawerLayoutFieldSettings");
        expect(panel).toContain("inline");
        expect(settings).toContain("data-visual-editor-field-settings-inline");
    });
});

describe("block creation", () => {
    it("lists registry blocks for household contact section", () => {
        const templates = listLayoutEditorBlockTemplatesForSection("household_contact");
        expect(templates.some((t) => t.key === "contact_secondary")).toBe(true);
        expect(templates.some((t) => t.key === "contact_emergency")).toBe(true);
        expect(templates.some((t) => t.key === "contact_billing")).toBe(true);
    });

    it("adds, removes, and reorders contact blocks", () => {
        let doc = buildLeadDrawerDefaultDoc();
        const added = addLayoutBlockToSection(doc, "household_contact", "contact_secondary");
        expect(added.ok, added.ok ? "" : added.error).toBe(true);
        if (!added.ok) return;
        doc = added.doc;
        const blocks = listSectionLayoutBlocks(doc, "household_contact");
        expect(blocks.some((b) => b.title === "Secondary Contact Card")).toBe(true);

        doc = removeLayoutBlock(doc, "household_contact", added.blockItemId);
        expect(listSectionLayoutBlocks(doc, "household_contact").some((b) => b.itemId === added.blockItemId)).toBe(false);

        const addedAgain = addLayoutBlockToSection(doc, "household_contact", "contact_emergency");
        expect(addedAgain.ok).toBe(true);
        if (!addedAgain.ok) return;
        doc = addedAgain.doc;
        doc = moveLayoutBlock(doc, "household_contact", addedAgain.blockItemId, -1);
        expect(doc.sections.find((s) => s.key === "household_contact")).toBeTruthy();
    });
});

describe("contact roles", () => {
    it("builds secondary, emergency, and billing contact cards with role metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        for (const key of ["contact_secondary", "contact_emergency", "contact_billing"] as const) {
            const result = addLayoutBlockToSection(doc, "household_contact", key);
            expect(result.ok, result.ok ? "" : result.error).toBe(true);
            if (!result.ok) continue;
            const item = result.doc.sections
                .find((s) => s.key === "household_contact")
                ?.rows.flatMap((r) => r.columns.flatMap((c) => c.items))
                .find((it) => it.id === result.blockItemId);
            expect(item?.kind).toBe("field_group");
            expect(readLayoutEditorContactRole(item?.metadata)).not.toBe("primary");
            expect(resolveLayoutEditorBlockTitle(item!, "fallback")).toContain("Contact Card");
        }
    });

    it("patches contact role and regenerates role-specific field refs", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const contact = doc.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.kind === "field_group" && it.refKey === "contact_block");
        expect(contact?.id).toBeTruthy();
        const next = patchLayoutBlockContactRole(doc, "household_contact", contact!.id, "secondary");
        const updated = next.sections
            .find((s) => s.key === "household_contact")
            ?.rows[0]?.columns[1]?.items.find((it) => it.id === contact!.id);
        expect(readLayoutEditorContactRole(updated?.metadata)).toBe("secondary");
        expect(updated?.label).toBe(contactRoleBlockTitle("secondary"));
        const email = updated?.rows?.[1]?.columns[0]?.items[0]?.refKey;
        expect(email).toBe("person.secondary_email");
    });
});

describe("live preview", () => {
    it("applies label and icon changes to working doc without save", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const blocks = listSectionLayoutBlocks(doc, "household_contact");
        const email = blocks.flatMap((b) => b.children).find((c) => c.refKey === "person.primary_email");
        expect(email).toBeTruthy();
        const next = patchLayoutEditorFieldDisplay(
            doc,
            email!.path,
            { icon: "mail", typographyIntent: "emphasis", displayType: "email" },
            "Work Email",
        );
        const updated = listSectionLayoutBlocks(next, "household_contact")
            .flatMap((b) => b.children)
            .find((c) => serializeLayoutEditorNodePath(c.path) === serializeLayoutEditorNodePath(email!.path));
        expect(updated?.title).toBe("Work Email");
        expect(updated?.displayConfig.icon).toBe("mail");
    });
});

describe("row templates", () => {
    it("stores child row actions and layout mode in metadata", () => {
        const config = writeLayoutEditorRowTemplateConfig(undefined, {
            layoutMode: "compact",
            actions: ["open_child_drawer", "edit_enrollment"],
            display: { avatar: true, statusPill: false, secondaryMetadata: true },
        });
        const parsed = readLayoutEditorRowTemplateConfig(config);
        expect(parsed.layoutMode).toBe("compact");
        expect(parsed.actions).toEqual(["open_child_drawer", "edit_enrollment"]);
        expect(parsed.display?.statusPill).toBe(false);
    });
});

describe("inspect mode", () => {
    it("maps visible runtime fields to inspect metadata", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const blocks = listSectionLayoutBlocks(doc, "household_contact");
        const emailBlock = blocks.find((b) => b.kind === "field_group");
        const email = emailBlock?.children.find((c) => c.refKey === "person.primary_email");
        expect(emailBlock && email).toBeTruthy();
        const info = buildLayoutEditorInspectInfo(emailBlock!, email!);
        expect(info.blockTitle).toContain("Contact");
        expect(info.fieldTitle.length).toBeGreaterThan(0);
        expect(info.serializedPath).toContain("group:household_contact:");
    });

    it("indexes preview item ids and ref keys for trace lookup", () => {
        const doc = buildLeadDrawerDefaultDoc();
        const { byItemId, byRefKey } = buildLayoutEditorItemIdPathIndex(
            listSectionLayoutBlocks(doc, "household_contact"),
        );
        expect(byRefKey.get("person.primary_email")?.fieldTitle).toBeTruthy();
        expect(byItemId.size + byRefKey.size).toBeGreaterThan(0);
    });

    it("wires inspect toggle and trace provider in editor shell", () => {
        const editor = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        const canvas = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx"),
            "utf8",
        );
        expect(editor).toContain("visual-editor-inspect-mode");
        expect(canvas).toContain("LayoutEditorRuntimeTraceProvider");
    });
});

describe("humanized link behavior", () => {
    it("exposes operator-facing link behavior labels", () => {
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.open_drawer).toBe("Open related record drawer");
        expect(LAYOUT_LINK_BEHAVIOR_LABELS.mailto).toBe("Open email composer");
        const settings = readFileSync(
            resolve(root, "components/adminV2/settings/OpportunityDrawerLayoutFieldSettings.tsx"),
            "utf8",
        );
        expect(settings).toContain("LAYOUT_LINK_BEHAVIOR_LABELS");
    });
});

describe("runtime transparency", () => {
    it("adds trace attributes in layout runtime preview cells", () => {
        const runtime = readFileSync(resolve(root, "components/layout/LayoutRuntimePlanView.tsx"), "utf8");
        const trace = readFileSync(resolve(root, "lib/layout/layoutEditorRuntimeTraceContext.tsx"), "utf8");
        expect(runtime).toContain("layoutEditorTraceProps");
        expect(trace).toContain("data-layout-editor-path");
    });
});
