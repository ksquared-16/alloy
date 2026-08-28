/**
 * §9 — TIME is platform debt, and this is the ratchet that keeps it from becoming a hazard.
 *
 * The correction Slice 5 recorded, kept durable here: the time-of-day primitive is NOT missing.
 * `lib/workspace/alloyTimeValue.ts` owns a settled `HH:mm` contract with parse, display and an input
 * control. The problem is ADOPTION — the Form type system has never heard of it.
 *
 * Adding a `time` field type touches seven surfaces, and three of them fail SILENTLY and
 * PERMISSIVELY when missed:
 *
 *   • `validateSubmission` — `default: break`, so an unknown type raises no error at all;
 *   • `FormEngineRenderer` — `default: return null`, an invisible REQUIRED question;
 *   • the Participant Runtime validator — `default: { ok: true }`, so "whenever" is a valid bedtime.
 *
 * A partial rollout would therefore look like it worked. So this file asserts an all-or-nothing
 * invariant: **`time` exists in every surface, or in none.** Whoever adds the type to the schema
 * gets a failing test naming the surfaces they have not done yet — which is the only moment the
 * warning is useful.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import { formatAlloyTimeDisplay, parseAlloyTimeInput } from "@/lib/workspace/alloyTimeValue";

/** Strip comments before scanning — a doc comment describing the gap is not an implementation of it. */
function code(relPath: string): string {
    const raw = readFileSync(resolve(process.cwd(), relPath), "utf8");
    return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SURFACES: { name: string; path: string; probe: RegExp }[] = [
    { name: "FormSchemaV1 field union", path: "lib/forms/schema.ts", probe: /type:\s*"time"|z\.literal\("time"\)/ },
    { name: "builder field type menu", path: "lib/forms/formBuilderSchema.ts", probe: /"time"/ },
    { name: "submission validation", path: "lib/forms/validateSubmission.ts", probe: /case\s+"time"/ },
    { name: "form engine renderer", path: "components/forms/engine/FormEngineRenderer.tsx", probe: /case\s+"time"/ },
    { name: "importer type inference", path: "lib/pos/processingCase/formDraft/fieldNormalization.ts", probe: /"time"/ },
    {
        name: "participant runtime validation",
        path: "lib/enrollment/participantRuntime/validateParticipantCandidate.ts",
        probe: /case\s+"time"/,
    },
];

describe("the value contract already exists — this is adoption debt, not a missing primitive", () => {
    it("parses and formats HH:mm today", () => {
        expect(parseAlloyTimeInput("7:30 pm")).toBe("19:30");
        expect(parseAlloyTimeInput("0730a")).toBe("07:30");
        expect(formatAlloyTimeDisplay("19:30")).toBe("7:30 PM");
    });

    it("rejects what is not a time, so the contract is real", () => {
        expect(parseAlloyTimeInput("whenever")).toBeNull();
        expect(parseAlloyTimeInput("25:00")).toBeNull();
    });
});

describe("all-or-nothing: `time` lands everywhere, or nowhere", () => {
    const adopted = SURFACES.filter((s) => s.probe.test(code(s.path)));
    const adminHasTime = (ADMIN_FIELD_TYPES as readonly string[]).includes("time");
    const anyAdopted = adopted.length > 0 || adminHasTime;

    it("has not adopted it in any surface yet — that is the recorded debt", () => {
        // When this fails, TIME is being adopted. Read the next test's message.
        expect(
            { adopted: adopted.map((s) => s.name), adminFieldTypes: adminHasTime },
            "TIME adoption has started — the all-or-nothing test below is now the one that matters",
        ).toEqual({ adopted: [], adminFieldTypes: false });
    });

    it("requires every surface once any surface has it", () => {
        if (!anyAdopted) return;
        const missing = SURFACES.filter((s) => !s.probe.test(code(s.path))).map((s) => s.name);
        if (!adminHasTime) missing.push("ADMIN_FIELD_TYPES");
        expect(
            missing,
            "A `time` type exists in some surfaces but not these. Three of them fail SILENTLY: validation accepts any string, the renderer returns null for a required question, and the participant runtime defaults unknown types to valid.",
        ).toEqual([]);
    });
});

describe("the three dangerous defaults, named so they are not rediscovered", () => {
    it("submission validation falls through to no error", () => {
        expect(code("lib/forms/validateSubmission.ts")).toMatch(/default:\s*\n?\s*break;/);
    });

    it("the renderer falls through to null — an invisible required question", () => {
        expect(code("components/forms/engine/FormEngineRenderer.tsx")).toMatch(/default:\s*\n?\s*return null;/);
    });

    it("the participant runtime defaults an unknown type to valid", () => {
        expect(code("lib/enrollment/participantRuntime/validateParticipantCandidate.ts")).toMatch(
            /default:\s*\n?\s*return \{ ok: true, value \};/,
        );
    });

    it("the database constrains field_type not at all", () => {
        // The eighth surface. `field_definitions.field_type` has no CHECK and no enum in any
        // migration, so a partial rollout is storable, invisible and unvalidated.
        const migrations = resolve(process.cwd(), "../supabase/migrations");
        const { readdirSync } = require("node:fs") as typeof import("node:fs");
        const constrained = readdirSync(migrations)
            .filter((f) => f.endsWith(".sql"))
            .some((f) => /field_type[^;]{0,200}CHECK\s*\(/i.test(readFileSync(resolve(migrations, f), "utf8")));
        expect(constrained, "if this is now true, the DB constrains field_type and the report is stale").toBe(false);
    });
});
