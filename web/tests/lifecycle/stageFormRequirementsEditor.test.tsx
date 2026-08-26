/**
 * The control that makes the two canonical actions reachable by a person.
 *
 * The actions existed and nothing could invoke them, so this asserts the two things that make the
 * difference: that the editor is composed into the stage surface a signed-in operator already uses,
 * and that its payloads are exactly what the canonical route accepts.
 *
 * Rendered to a string — this suite has no DOM environment — so these are structure and copy
 * assertions, not interaction ones. Labelled as such rather than implied.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import StageFormRequirementsEditor from "@/components/adminV2/settings/lifecycle/StageFormRequirementsEditor";
import { parseStageRequirementsV1, isAuthorableRequirementKind } from "@/lib/lifecycle/stageRequirementsV1";
import type { LifecycleBuilderProcessRecord, LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const STAGE_EDITOR = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/StageEditorV2.tsx"),
    "utf8",
);
const EDITOR = readFileSync(
    resolve(__dirname, "../../components/adminV2/settings/lifecycle/StageFormRequirementsEditor.tsx"),
    "utf8",
);

const FORM = "17bc2de8-0f83-48a6-aabc-bcd72725bce8";

const process = (entry?: string): LifecycleBuilderProcessRecord =>
    ({
        id: "proc-1", key: "enrollment", name: "Enrollment", primary_entity: "opportunity",
        sort_order: 0, is_active: true, stages: [],
        ...(entry ? { entry_points_v1: { version: 1 as const, by_intent: { enrollment_start: entry } } } : {}),
    }) as LifecycleBuilderProcessRecord;

const stage = (requirements?: unknown[]): LifecycleBuilderStageRecord =>
    ({
        id: "s1", key: "enrolling", label: "Enrolling", sort_order: 0, is_active: true,
        ...(requirements ? { requirements_v1: parseStageRequirementsV1({ version: 1, requirements })! } : {}),
    }) as LifecycleBuilderStageRecord;

const render = (p: Parameters<typeof StageFormRequirementsEditor>[0]) =>
    renderToStaticMarkup(<StageFormRequirementsEditor {...p} />);

describe("the control is composed into the operator's stage surface", () => {
    it("renders inside the Requirements section of the stage editor", () => {
        const at = STAGE_EDITOR.indexOf("<StageFormRequirementsEditor");
        expect(at).toBeGreaterThan(-1);
        const sectionAt = STAGE_EDITOR.indexOf('id="requirements"');
        expect(sectionAt).toBeGreaterThan(-1);
        expect(at).toBeGreaterThan(sectionAt);
        // Reloads from the server after a write rather than trusting local state.
        expect(STAGE_EDITOR).toContain("onSaved={onReloadConfiguration}");
    });

    it("calls only the canonical route, and only the two approved actions", () => {
        expect(EDITOR).toContain("/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder");
        expect(EDITOR).toContain('action: "set_stage_requirements"');
        expect(EDITOR).toContain('action: "set_process_entry_point"');
        // No second authority: no direct table access, no publish path of its own.
        expect(EDITOR).not.toContain("supabase");
        expect(EDITOR).not.toContain("configuration/publish");
    });

    it("sends the session so the route's own authorization applies", () => {
        expect(EDITOR).toContain('credentials: "include"');
    });
});

describe("what it puts on screen", () => {
    it("lists the authored requirements in authored order", () => {
        const html = render({
            departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling",
            stageRecord: stage([
                { requirement_id: "r1", kind: "form", form_definition_id: FORM, level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking" },
            ]),
            process: process(),
        });
        expect(html).toContain("Forms this stage requires");
        expect(html).toContain(FORM); // no forms list loaded server-side, so the id is the fallback label
        expect(html).toContain("Save requirements");
    });

    it("says an authored-empty stage is a decision, not a gap", () => {
        // The D-90 distinction has to reach the screen, or an operator reads "requires nothing" as
        // "not configured yet" and re-authors what someone already decided.
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage([]), process: process() });
        expect(html).toMatch(/authored decision, not a gap/);
    });

    it("distinguishes never-authored from authored-empty", () => {
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage(), process: process() });
        expect(html).toContain("No forms required yet.");
        expect(html).not.toMatch(/authored decision, not a gap/);
    });

    it("says plainly when no entry stage is set, because Start Enrollment would refuse", () => {
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage(), process: process() });
        expect(html).toMatch(/nowhere to begin and will refuse/);
        expect(html).toContain("Begin new enrollments in Enrolling");
    });

    it("names the stage that currently holds the entry point", () => {
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage(), process: process("waitlist") });
        expect(html).toMatch(/currently begins in “waitlist”/);
    });

    it("offers no action when this stage is already the entry stage", () => {
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage(), process: process("enrolling") });
        expect(html).toContain("This is the entry stage");
        expect(html).toContain("disabled");
    });

    it("refuses to guess when no process is selected", () => {
        const html = render({ departmentId: "d1", stageKey: "enrolling", stageLabel: "Enrolling", stageRecord: stage(), process: null });
        expect(html).toContain("Select a business process");
    });
});

describe("the payload it builds is what the route accepts", () => {
    it("defaults a newly added form to the dimensions the route will store", () => {
        // The defaults are asserted here because they are the ones the certification approved, and a
        // silent change to them would change what a family is required to do.
        expect(EDITOR).toContain('level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking"');
    });

    it("builds rows the canonical parser reads without dropping any", () => {
        const rows = [
            { requirement_id: "form_a", kind: "form", form_definition_id: FORM, level: "required", scope: "record", timing: "stage_exit", enforcement: "blocking" },
        ];
        const parsed = parseStageRequirementsV1({ version: 1, requirements: rows })!;
        expect(parsed.requirements).toHaveLength(rows.length);
        expect(parsed.requirements.every((r) => isAuthorableRequirementKind(r.ref.kind))).toBe(true);
    });

    it("derives requirement identity from the form, so a re-save is not a new requirement", () => {
        // The section is REPLACED on every save. A random id would make an unchanged requirement look
        // like a different one each time it was written.
        expect(EDITOR).toContain("function requirementIdFor(formDefinitionId: string)");
        expect(EDITOR).toContain("`form_${formDefinitionId.replace(/-/g, \"\")}`");
    });

    it("shows the route's own refusal rather than restating the rule", () => {
        expect(EDITOR).toContain("[json.error, json.reason].filter(Boolean).join(\" \")");
    });
});
