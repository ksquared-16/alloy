/**
 * Sprint 5.18AC — Person contact + Child program_enrollment runtime parity.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LayoutRuntimePlanView from "@/components/layout/LayoutRuntimePlanView";
import { LayoutRuntimeBlockEditProvider } from "@/components/layout/LayoutRuntimeBlockEditContext";
import { buildChildDrawerDefaultDoc } from "@/lib/layout/defaultChildLayouts";
import { buildPersonDrawerDefaultDoc } from "@/lib/layout/defaultPersonLayouts";
import { buildProofChildRecord } from "@/lib/layout/runtime/buildProofChildRecord";
import { buildProofPersonRecord } from "@/lib/layout/runtime/buildProofPersonRecord";
import { mergeChildLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeChildLayoutRuntimeWidgetRecord";
import { mergePersonLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergePersonLayoutRuntimeWidgetRecord";
import {
    isLayoutRuntimePersonContactRefKey,
    saveLayoutRuntimePersonContactEdits,
} from "@/lib/layout/runtime/layoutRuntimePersonContactEdit";
import {
    collectLayoutRuntimeChildStandaloneBaselines,
    saveLayoutRuntimeChildStandaloneEdits,
} from "@/lib/layout/runtime/layoutRuntimeChildFieldEdit";
import { prepareDrawerLayoutDocForEditor } from "@/lib/layout/drawerLayoutEditorModel";

describe("layoutBuilderRuntimeParity 5.18AC person contact block", () => {
    it("default person contact section exposes editable person contact ref keys", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const contactSection = doc.sections.find((s) => s.key === "contact_information");
        expect(contactSection).toBeTruthy();
        const refKeys = contactSection!.rows.flatMap((r) =>
            r.columns.flatMap((c) => c.items.map((i) => i.refKey)),
        );
        expect(refKeys.some((k) => isLayoutRuntimePersonContactRefKey(k ?? ""))).toBe(true);
    });

    it("person contact section edit renders inline controls for editable fields", () => {
        const doc = buildPersonDrawerDefaultDoc();
        const record = mergePersonLayoutRuntimeWidgetRecord(
            buildProofPersonRecord(),
            buildProofPersonRecord(),
        );
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <LayoutRuntimePlanView doc={doc} record={record} entityId="proof-person-001" canMutate />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain("jamie.j@example.com");
        expect(html).toContain('data-layout-runtime-section-key="contact_information"');
    });

    it("person contact save adapter resolves standalone person id", async () => {
        const record = buildProofPersonRecord({ "person.id": "person-abc" });
        const baseline = {
            "person.first_name": "Jamie",
            "person.last_name": "Johnson",
            "person.email": "jamie.j@example.com",
            "person.phone": "(555) 234-8901",
        };
        const result = await saveLayoutRuntimePersonContactEdits({
            record,
            baseline,
            draft: baseline,
        });
        expect(result.ok).toBe(true);
    });
});

describe("layoutBuilderRuntimeParity 5.18AC child program_enrollment section", () => {
    it("default child program_enrollment section includes editable inquiry_child fields", () => {
        const doc = buildChildDrawerDefaultDoc();
        const section = doc.sections.find((s) => s.key === "program_enrollment");
        expect(section).toBeTruthy();
        const editableItems = section!.rows.flatMap((r) =>
            r.columns.flatMap((c) => c.items.filter((i) => i.editable === true)),
        );
        expect(editableItems.some((i) => i.refKey?.startsWith("inquiry_child."))).toBe(true);
        expect(editableItems.some((i) => i.refKey === "child.first_name")).toBe(true);
    });

    it("child program section edit renders enrollment fields from merged widget record", () => {
        const doc = buildChildDrawerDefaultDoc();
        const vmRecord = {
            first_name: "Riley",
            last_name: "Brooks",
            desired_program_type: "Infants",
            desired_start_date: "2026-09-01",
            _enrollment_mirror: [{ id: "ocm-1", customer_member_id: "cm-1", opportunity_id: "opp-1" }],
        };
        const record = mergeChildLayoutRuntimeWidgetRecord(buildProofChildRecord(), vmRecord);
        const html = renderToStaticMarkup(
            <LayoutRuntimeBlockEditProvider editMode="edit_button">
                <LayoutRuntimePlanView doc={doc} record={record} entityId="proof-child-001" canMutate />
            </LayoutRuntimeBlockEditProvider>,
        );
        expect(html).toContain("Infant");
        expect(html).toContain('data-layout-runtime-section-key="program_enrollment"');
    });

    it("child standalone save no-ops when draft matches baseline", async () => {
        const record = mergeChildLayoutRuntimeWidgetRecord(buildProofChildRecord(), {
            first_name: "Riley",
            last_name: "Brooks",
            _enrollment_mirror: [{ id: "ocm-1", customer_member_id: "cm-1", opportunity_id: "opp-1" }],
        });
        const baseline = collectLayoutRuntimeChildStandaloneBaselines(record);
        const result = await saveLayoutRuntimeChildStandaloneEdits({
            record,
            baseline,
            draft: baseline,
        });
        expect(result.ok).toBe(true);
    });
});

describe("layoutBuilderRuntimeParity 5.18AC person/child visual editor publish path", () => {
    it("prepareDrawerLayoutDocForEditor accepts person and child default docs", () => {
        const person = prepareDrawerLayoutDocForEditor(buildPersonDrawerDefaultDoc());
        const child = prepareDrawerLayoutDocForEditor(buildChildDrawerDefaultDoc());
        expect(person.ok).toBe(true);
        if (person.ok) expect(person.surfaceKey).toBe("person_drawer");
        expect(child.ok).toBe(true);
        if (child.ok) expect(child.surfaceKey).toBe("child_drawer");
    });

    it("gallery routes each enabled surface with surface-specific seed", () => {
        const gallery = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/LayoutGalleryClient.tsx"),
            "utf8",
        );
        expect(gallery).toContain("person_default");
        expect(gallery).toContain("child_default");
        expect(gallery).toContain("openSurfaceEditor");
    });

    it("visual editor loads drawer surface config for person and child", () => {
        const editor = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/OpportunityDrawerLayoutVisualEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("prepareDrawerLayoutDocForEditor");
        expect(editor).toContain("dispatchPersonDrawerLayoutPublished");
        expect(editor).toContain("dispatchChildDrawerLayoutPublished");
    });

    it("person and child build-mode canvas uses editable section frames via CompositionGrid", () => {
        const canvas = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/OpportunityDrawerLayoutEditorCanvas.tsx"),
            "utf8",
        );
        expect(canvas).not.toContain("PersonChildRuntimeCompositionPreview");
        expect(canvas).toContain("resolveCompositionGridLayout");
        expect(canvas).toContain("ExperienceBuilderEditableCardShell");
        expect(canvas).toContain('data-visual-editor-editable="true"');
        expect(canvas).toContain("visual-editor-zone-summary_strip");
        expect(canvas).toContain("visual-editor-zone-right_rail");
    });
});
