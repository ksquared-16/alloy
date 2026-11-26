/**
 * RL-14 — THE WORDS AN ORGANIZATION CHOOSES HAVE AN OWNER, AND IT IS NOT A ROLE TITLE.
 *
 * `configuration.vocabulary.manage` covers FOUR families, not the five that were proposed. The fifth
 * is excluded, and this file asserts the exclusion as hard as it asserts the inclusions — because a
 * capability that quietly grows to cover a fifth family is exactly how a narrow authority becomes a
 * broad one.
 *
 * WHY STATUS DEFINITIONS ARE OUT. `normalizeStatusDefinitionMetadata` PERSISTS the process-stage key
 * (`out[PROCESS_STAGE_METADATA_KEY] = t`) and `parseProcessStageKeyFromStatusMetadata` reads it to
 * decide which lifecycle stage a status belongs to. Editing a status definition can therefore rebind
 * a status to a different process stage — the same effect `enrollment-process/status-stages` gates
 * on `business_process.configure`, with queue synchronisation hanging off it. Under a generic
 * vocabulary key, whoever may rename a label could rebind a lifecycle.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { areaForRow, areaMeta, UNMAPPED } from "@/lib/access/capabilityTaxonomy";

const WEB = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(WEB, rel), "utf8");

/** The families this capability owns, and the mutations each one exposes. */
const INCLUDED: Record<string, readonly string[]> = {
    "app/api/admin/entity-labels/route.ts": ["PUT", "DELETE"],
    "app/api/admin/customer-person-role-types/route.ts": ["POST"],
    "app/api/admin/customer-person-role-types/[id]/route.ts": ["PATCH"],
    "app/api/admin/person-relationship-type-settings/route.ts": ["POST"],
    "app/api/admin/person-relationship-type-settings/[id]/route.ts": ["PATCH"],
    "app/api/admin/assignment-types/route.ts": ["POST"],
    "app/api/admin/assignment-types/[id]/route.ts": ["PATCH"],
};

/** Owned elsewhere, on purpose, with the owner named. */
const EXCLUDED: Record<string, { owner: RegExp; methods: readonly string[]; why: string }> = {
    "app/api/admin/status-definitions/route.ts": {
        owner: /requireBusinessProcessCapability\(ctx, BUSINESS_PROCESS_CONFIGURE\)/,
        methods: ["POST"],
        why: "a status definition's metadata carries its process-stage binding",
    },
    "app/api/admin/status-definitions/[id]/route.ts": {
        owner: /requireBusinessProcessCapability\(ctx, BUSINESS_PROCESS_CONFIGURE\)/,
        methods: ["PATCH", "DELETE"],
        why: "PATCH can rebind the stage; DELETE removes a status a stage may reference",
    },
};

/**
 * Assignment EXECUTION routes. Defining the types that exist must never confer the ability to assign
 * anything — the doctrine Assignments Authority Model V1 established, asserted from this side.
 */
const ASSIGNMENT_EXECUTION = [
    "app/api/admin/communications/conversations/[id]/assign/route.ts",
    "app/api/admin/jobs/[id]/assign-vendor/route.ts",
    "app/api/admin/schedules/[id]/assign/route.ts",
    "app/api/admin/schedules/[id]/assignment/route.ts",
];

/** Adjacent Configuration authorities that must not imply, or be implied by, this one. */
const ADJACENT = ["fields.manage", "option_sets.manage", "layouts.manage", "sections.manage"];

const VOCAB_CALL = /requireOrganizationVocabularyCapability\(ctx\)/;

function handlerBody(file: string, method: string): string | null {
    const src = read(file);
    const marks: { at: number; m: string }[] = [];
    const re = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) marks.push({ at: m.index, m: m[1] });
    const i = marks.findIndex((x) => x.m === method);
    if (i < 0) return null;
    return src.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : src.length);
}

describe("RL-14 — organization vocabulary is one authority, over four families", () => {
    it("finds the surface it claims to be checking", () => {
        const declared = Object.values(INCLUDED).reduce((n, ms) => n + ms.length, 0);
        expect(declared, "non-vacuity: the included surface must not be empty").toBe(8);
        for (const [file, methods] of Object.entries(INCLUDED)) {
            expect(fs.existsSync(path.join(WEB, file)), `${file} missing`).toBe(true);
            for (const m of methods) expect(handlerBody(file, m), `${file} ${m} missing`).toBeTruthy();
        }
    });

    it("gates every included mutation on the vocabulary capability, exactly", () => {
        const wrong: string[] = [];
        for (const [file, methods] of Object.entries(INCLUDED)) {
            for (const m of methods) {
                const body = handlerBody(file, m)!;
                if (!VOCAB_CALL.test(body)) wrong.push(`${file} ${m}: no vocabulary gate`);
            }
        }
        expect(wrong).toEqual([]);
    });

    it("rejects a role-title fallback anywhere on the included surface", () => {
        const offenders: string[] = [];
        for (const file of Object.keys(INCLUDED)) {
            for (const [i, line] of read(file).split("\n").entries()) {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
                if (/ctx\.role\s*[!=]==\s*"(admin|ops)"/.test(line)) offenders.push(`${file}:${i + 1}`);
            }
        }
        expect(offenders, "eight of these mutations were gated on the word \"admin\"").toEqual([]);
    });

    it("rejects portal-admission-only mutation", () => {
        const stragglers = Object.keys(INCLUDED).filter((f) => /await requireAdminOrOps\(\)/.test(read(f)));
        expect(stragglers).toEqual([]);
    });

    it("keeps status definitions OUT, and owned by Business Process", () => {
        /*
         * The exclusion is asserted as hard as the inclusions. If a later slice moved these under the
         * vocabulary key "for consistency", lifecycle-stage rebinding would become reachable by
         * whoever may rename a label.
         */
        for (const [file, { owner, methods, why }] of Object.entries(EXCLUDED)) {
            const src = read(file);
            expect(src, `${file} must not take the vocabulary capability — ${why}`).not.toMatch(VOCAB_CALL);
            for (const m of methods) {
                const body = handlerBody(file, m);
                expect(body, `${file} ${m} missing`).toBeTruthy();
                expect(body!, `${file} ${m} must be owned by business_process.configure`).toMatch(owner);
            }
        }
        // And the reason must remain true in the source it rests on.
        const norm = read("lib/admin/normalizeStatusMetadata.ts");
        expect(norm, "if status metadata no longer carries the stage key, revisit the exclusion")
            .toMatch(/PROCESS_STAGE_METADATA_KEY/);
    });

    it("captures no assignment EXECUTION route", () => {
        /*
         * Managing the words available for assignment is not authority to assign. Assignments
         * Authority Model V1 put each assignment under its own business surface; this asserts the
         * vocabulary key never reaches them.
         */
        for (const file of ASSIGNMENT_EXECUTION) {
            expect(fs.existsSync(path.join(WEB, file)), `${file} missing`).toBe(true);
            expect(read(file), `${file} must not be gated on vocabulary`).not.toMatch(VOCAB_CALL);
        }
        // The type routes, conversely, must not reach an assignment table for writing.
        const svc = read("lib/operationalAssignments/assignmentTypeService.ts");
        const writesAssignments = /\.from\("schedule_assignments"\)[\s\S]{0,200}?\.(update|insert|delete)\(/.test(svc);
        expect(writesAssignments, "configuring a type must not mutate assignments").toBe(false);
    });

    it("is not implied by, and does not imply, the adjacent Configuration authorities", () => {
        const helper = read("lib/access/organizationVocabularyAuthority.ts");
        for (const key of ADJACENT) {
            // The helper may NAME them in prose; it must not accept them as this authority.
            expect(helper).not.toMatch(new RegExp(`includes\\(\\s*"${key.replace(".", "\\.")}"`));
        }
        for (const file of Object.keys(INCLUDED)) {
            const src = read(file);
            for (const key of ADJACENT) {
                expect(src, `${file} must not accept ${key} as vocabulary authority`)
                    .not.toMatch(new RegExp(key.replace(/\./g, "\\.")));
            }
        }
    });

    it("lands under Configuration in the role editor, not in an unmapped bucket", () => {
        /*
         * A new capability with no product home renders as "not yet mapped", which is honest and
         * useless: an administrator looking for vocabulary would not find it. The key is grouped
         * `config`, which the taxonomy maps to the existing Configuration area — so it needs no new
         * top-level area and no row override.
         */
        const area = areaForRow({ id: "configuration.vocabulary", groupKey: "config" });
        expect(area, "the vocabulary key must not be unmapped").not.toBe(UNMAPPED);
        expect(area).toBe("configuration");
        expect(areaMeta(area)?.label).toBe("Configuration");
    });

    it("names the key in its refusal, so a denial is debuggable", () => {
        const helper = read("lib/access/organizationVocabularyAuthority.ts");
        expect(helper).toMatch(/"configuration\.vocabulary\.manage"/);
        expect(helper).toMatch(/required_permission/);
    });
});
