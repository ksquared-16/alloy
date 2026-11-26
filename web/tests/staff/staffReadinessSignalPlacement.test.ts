/**
 * THE V1 RULE, WRITTEN WHERE IT CAN FAIL.
 *
 * "Advisory" is a sentence in a brief until something checks it. These are source
 * locks over the two surfaces that render the signal and over the chip itself,
 * because the way this rule dies is not a deliberate decision to block — it is
 * somebody adding `disabled={!row.readiness}` to a row six months from now and
 * nobody noticing that Operations quietly acquired a gate.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const code = (rel: string) => readFileSync(join(__dirname, "../../", rel), "utf8");

/** Comments explain what the code refuses to do; only statements do anything. */
function statements(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
}

const CHIP = "components/adminV2/staff/StaffReadinessSignalChip.tsx";
const PICKER = "components/adminV2/scheduling/AssignmentSubjectPicker.tsx";
const RECORDS = "components/adminV2/records/RecordsStaffSection.tsx";
const SIGNALS = "lib/staffReadiness/staffReadinessSignals.ts";

describe("the chip can inform and cannot interfere", () => {
    it("takes no handler and drives no disabled state", () => {
        const src = statements(code(CHIP));
        expect(src).not.toMatch(/onClick/);
        expect(src).not.toMatch(/disabled/);
        expect(src).not.toMatch(/preventDefault|stopPropagation/);
    });

    it("renders nothing for a ready or absent signal", () => {
        const src = statements(code(CHIP));
        expect(src).toMatch(/tone === "ready"[\s\S]*return null|return null/);
    });
});

describe("the surfaces that render it did not acquire a gate", () => {
    for (const [name, rel] of [["assignment chooser", PICKER], ["records staff", RECORDS]] as const) {
        it(`${name} never disables or filters a row on readiness`, () => {
            const src = statements(code(rel));
            // A row may CARRY readiness; it may not be judged by it.
            expect(src, "readiness must not drive `disabled`")
                .not.toMatch(/disabled=\{[^}]*readiness/);
            // `[^)]*` stopped at the `)` of `(r) =>`, so an arrow-function predicate
            // slipped straight through the first version of this lock. Bound on the
            // statement instead of on the parenthesis.
            expect(src, "readiness must not remove people from the list")
                .not.toMatch(/\.filter\([^;]{0,200}?readiness/);
            expect(src, "readiness must not gate the choose handler")
                .not.toMatch(/if\s*\([^;]{0,200}?readiness[^;]{0,200}?\)\s*(?:return|\{\s*return)/);
        });

        it(`${name} uses no override, acknowledgement or permission vocabulary`, () => {
            const src = statements(code(rel));
            expect(src).not.toMatch(/Override|Acknowledge|Schedule anyway|Cannot assign|Not permitted/i);
        });
    }
});

describe("no readiness storage and no blocking trigger were introduced", () => {
    it("the signal module stores nothing and never asks for a blocking trigger", () => {
        const src = statements(code(SIGNALS));
        expect(src).toMatch(/trigger: "record_view"/);
        expect(src).not.toMatch(/action_execute|form_submit|status_transition/);
        expect(src).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
        expect(src).not.toMatch(/is_ready|readiness_status/);
    });

    it("nothing anywhere persists an advisory signal", () => {
        const walk = (dir: string): string[] => {
            const out: string[] = [];
            for (const entry of readdirSync(dir)) {
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) out.push(...walk(full));
                else if (/\.tsx?$/.test(entry)) out.push(full);
            }
            return out;
        };
        const offenders: string[] = [];
        for (const root of ["lib", "app", "components"]) {
            for (const file of walk(join(__dirname, "../../", root))) {
                const src = statements(readFileSync(file, "utf8"));
                if (/from\(\s*["'][a-z_]*readiness[a-z_]*["']\s*\)/.test(src)) {
                    offenders.push(file.split("/web/")[1]!);
                }
            }
        }
        expect(offenders, "there is no readiness table to read or write").toEqual([]);
    });
});

describe("child operational surfaces are untouched", () => {
    it("the chooser renders the chip only on the staff tab", () => {
        const src = statements(code(PICKER));
        // The modal serves both subjects. A child has no employment and therefore no
        // readiness; rendering the chip unconditionally would put an empty element in
        // every child row and invite somebody to give children a readiness later.
        expect(src).toMatch(/tab === "staff"[\s\S]{0,120}StaffReadinessSignalChip/);
    });

    it("the child projection is read exactly as before", () => {
        const src = statements(code(PICKER));
        expect(src).toMatch(/\/api\/admin\/records\/children\?limit=200/);
        expect(src, "children must not acquire a readiness query")
            .not.toMatch(/records\/children[^"']*readiness/);
    });
});

describe("the signal is asked for deliberately, not by default", () => {
    it("the directory only evaluates readiness when a caller opts in", () => {
        const src = statements(code("app/api/admin/staff/directory/route.ts"));
        expect(src).toMatch(/include_readiness/);
        expect(src).toMatch(/if\s*\(includeReadiness/);
    });

    it("both rendering surfaces actually opt in", () => {
        expect(statements(code(PICKER))).toMatch(/include_readiness=true/);
        expect(statements(code(RECORDS))).toMatch(/include_readiness=true/);
    });
});
