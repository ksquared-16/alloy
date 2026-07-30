/**
 * R2 — SUBJECT GRAIN IS DERIVED ONCE, AND A GRAIN WITH NO SUBJECT REFUSES.
 *
 * Two vocabularies meet at this seam and they do not line up:
 *   StageGrain / RowGrain   family | child | person | account | work_item   (lifecycle, on the lens)
 *   OperationalGrain        case   | child | candidate                      (Focus Panel)
 *
 * `family` and `case` mean the same thing under different names; `person`/`account`/`work_item` have no
 * panel representation at all. A `?? "case"` across that seam would render a lens as a family that is not
 * one — the wrong-subject substitution Subject Authority exists to prevent. So the resolver is TOTAL and
 * its failure is a value.
 *
 * The defect this pins was real and shipped: `buildCommitCriticalOperationalContext` hardcoded
 * `grain: "case"` and `subject.type: "opportunity"` while the provisioning answer, a few modules away, had
 * already resolved the lens grain and published it as `rowGrain`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSubjectGrain } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import { provisioningErrorKind } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the lens grain maps to a subject grain, totally", () => {
    it("family is the case grain under its lifecycle name", () => {
        expect(resolveSubjectGrain("family")).toEqual({
            ok: true,
            grain: "case",
            subjectType: "opportunity",
        });
    });

    it("child passes through as its own grain and its own subject type", () => {
        expect(resolveSubjectGrain("child")).toEqual({ ok: true, grain: "child", subjectType: "child" });
    });

    it("a grain with no panel subject REFUSES — it never resolves to case", () => {
        for (const g of ["person", "account", "work_item"] as const) {
            const r = resolveSubjectGrain(g);
            expect(r.ok).toBe(false);
            // The failure must name the grain, or the refusal is unactionable.
            if (!r.ok) expect(r.reason).toContain(g);
        }
    });

    it("no input produces `case` except `family` — the fallback that must not exist", () => {
        const resolvedToCase = (["family", "child", "person", "account", "work_item"] as const).filter((g) => {
            const r = resolveSubjectGrain(g);
            return r.ok && r.grain === "case";
        });
        expect(resolvedToCase).toEqual(["family"]);
    });
});

describe("the refusal is a configuration problem the operator can leave", () => {
    it("grain_unsupported classifies as configuration, like grain_ambiguous", () => {
        expect(provisioningErrorKind("grain_unsupported")).toBe("configuration");
        expect(provisioningErrorKind("grain_unsupported")).toBe(provisioningErrorKind("grain_ambiguous"));
    });

    it("it refuses WITH the navigation frame, so the surface stays escapable", () => {
        const src = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
        const site = src.slice(src.indexOf('fail("grain_unsupported"'), src.indexOf('fail("grain_unsupported"') + 220);
        expect(site).toContain("navFrame");
    });
});

describe("derived once, consumed — not re-derived downstream", () => {
    it("the answer resolves the subject grain at the single site that knows the lens", () => {
        const src = read("lib/runtime/provisioning/workUnitProvisioningAnswer.ts");
        // Exactly one derivation call in the composer.
        expect(src.split("resolveSubjectGrain(").length - 1).toBe(1);
        // …and it is published on the answer.
        expect(src).toContain("subjectGrain,");
    });

    it("the commit-critical builder no longer hardcodes grain or subject type", () => {
        const src = read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts");
        const body = src.slice(src.indexOf("export function buildCommitCriticalOperationalContext"));
        expect(body).not.toMatch(/grain:\s*"case"\s*,/);
        expect(body).not.toMatch(/type:\s*"opportunity"\s*,/);
        expect(body).toContain("input.subjectGrain?.grain");
        expect(body).toContain("input.subjectGrain?.subjectType");
    });

    it("the builder does NOT re-derive grain — it only reads what the answer resolved", () => {
        const src = read("lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer.ts");
        expect(src).not.toContain("resolveSubjectGrain");
        expect(src).not.toContain("resolveLensRowGrain");
    });
});
