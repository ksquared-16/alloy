/**
 * W-51 / `IA-7` + `M2-17` — the Access surface states the role union the schema stores, and no
 * replacement deletes a role the operator was never shown.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21 (`W-51`);
 * finding: `docs/platform/planning/access-identity-v2/02-canonical-access-identity-model.md` §17.4.
 *
 * Two tiers, because the defect had two halves and either alone regrows the other:
 *
 *   **Tier B (behaviour)** — the projection functions, exercised directly. These are what the
 *   surface now asks instead of reading `primary_role`.
 *
 *   **Tier A (static, discovered subject)** — every file under the Access chapter directory is
 *   walked from disk, so a fifth chapter added tomorrow is checked tomorrow. `RL-1`, `RL-4` and
 *   `RL-11` were each defeated by an enumerated subject; this file does not repeat that.
 *
 * **Why `primary_role` is gated rather than banned.** The value legitimately exists in the API
 * payload and seeds the picker's default selection. Banning the substring would be satisfied by
 * renaming it. Instead every occurrence must carry a declared reason of substance — W-14's idiom,
 * where an absence is auditable only because it had to be written down.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    heldRoleKeys,
    holdsMultipleRoles,
    memberHoldsRole,
    normalizeHeldRoleKeys,
    replacementIsNoOp,
    roleAssignmentLabel,
    rolesDiscardedByReplacement,
} from "@/lib/access/memberRoleAssignment";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const ACCESS_COMPONENTS = path.join(REPO_ROOT, "web/components/adminV2/settings/access");
const USERS_PAGE = path.join(ACCESS_COMPONENTS, "AccessUsersConfigurationPage.tsx");

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/** Strip block and line comments — a rule about code must not be satisfied or broken by prose. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ── Tier B — the projection ────────────────────────────────────────────────────────────────────

describe("W-51 / IA-7 — role assignment is the union, not the survivor of a collapse", () => {
    it("normalizes to a sorted, de-duplicated, non-empty set", () => {
        expect(normalizeHeldRoleKeys(["ops", "admin", "ops", " admin ", "", "  "])).toEqual(["admin", "ops"]);
        expect(normalizeHeldRoleKeys(null)).toEqual([]);
        expect(normalizeHeldRoleKeys(undefined)).toEqual([]);
    });

    it("prefers the union over the collapsed value, and never the reverse", () => {
        // The exact shape the plan names: displayRoleForAdminPicker returns `admin`, and
        // `regional_lead` is the role that used to vanish between the database and the screen.
        expect(heldRoleKeys({ role_keys: ["admin", "regional_lead"], primary_role: "admin" })).toEqual([
            "admin",
            "regional_lead",
        ]);
    });

    it("falls back to primary_role only when no union was carried", () => {
        expect(heldRoleKeys({ role_keys: [], primary_role: "ops" })).toEqual(["ops"]);
        expect(heldRoleKeys({ primary_role: "ops" })).toEqual(["ops"]);
    });

    it("returns null rather than a plausible word for a membership with no role rows", () => {
        // IA-R1: an uncomputed value renders as unknown. `"Member"` here would be the manufactured
        // certainty this wave exists to remove.
        expect(roleAssignmentLabel({ role_keys: [], primary_role: "" }, (k) => k)).toBeNull();
    });

    it("labels every held role, in a stable order", () => {
        const label = roleAssignmentLabel({ role_keys: ["regional_lead", "admin"] }, (k) =>
            k === "admin" ? "Administrator" : "Regional Lead",
        );
        expect(label).toBe("Administrator · Regional Lead");
    });

    it("counts a member toward every role they hold", () => {
        const member = { role_keys: ["admin", "regional_lead"], primary_role: "admin" };
        expect(memberHoldsRole(member, "admin")).toBe(true);
        // The assertion that fails against the old `primary_role ===` predicate.
        expect(memberHoldsRole(member, "regional_lead")).toBe(true);
        expect(memberHoldsRole(member, "ops")).toBe(false);
    });

    it("identifies the multi-role membership the one-role UI could not state", () => {
        expect(holdsMultipleRoles({ role_keys: ["admin", "regional_lead"] })).toBe(true);
        expect(holdsMultipleRoles({ role_keys: ["admin"] })).toBe(false);
        expect(holdsMultipleRoles({ role_keys: [] })).toBe(false);
    });
});

describe("M2-17 — a replacement names what it would delete", () => {
    it("reports every role the PATCH would remove", () => {
        // PATCH …/role replaces ALL role rows for the pair, so the loss is everything but the
        // submitted role — including when the submitted role is not currently held at all.
        expect(rolesDiscardedByReplacement({ role_keys: ["admin", "regional_lead"] }, "admin")).toEqual([
            "regional_lead",
        ]);
        expect(rolesDiscardedByReplacement({ role_keys: ["admin", "regional_lead"] }, "ops")).toEqual([
            "admin",
            "regional_lead",
        ]);
    });

    it("reports no loss for a single-role membership", () => {
        expect(rolesDiscardedByReplacement({ role_keys: ["admin"] }, "ops")).toEqual(["admin"]);
        expect(rolesDiscardedByReplacement({ role_keys: ["ops"] }, "ops")).toEqual([]);
    });

    it("calls a multi-role submission a change even when the collapsed value matches", () => {
        // This is the whole of M2-17's guard defect. The old control compared the selection to
        // `primary_role`, so {admin, regional_lead} with `admin` selected read as "no change" and
        // sat disabled — while submitting it would have deleted `regional_lead`. The union is
        // unchanged only when it is exactly the one submitted role.
        expect(replacementIsNoOp({ role_keys: ["admin", "regional_lead"], primary_role: "admin" }, "admin")).toBe(
            false,
        );
        expect(replacementIsNoOp({ role_keys: ["admin"], primary_role: "admin" }, "admin")).toBe(true);
        expect(replacementIsNoOp({ role_keys: ["admin"] }, "")).toBe(true);
    });
});

// ── Tier A — the surface, discovered from disk ─────────────────────────────────────────────────

/**
 * Declared uses of the collapsed value. Key is `<file>:<line-fragment>`; the value must say why
 * this occurrence is not a claim about what someone holds, in at least 40 characters.
 */
const PRIMARY_ROLE_EXEMPT: Record<string, string> = {
    "AccessUsersConfigurationPage.tsx:type": "Field of the API payload type. Carrying it is not asserting it; the union sits beside it.",
    "AccessUsersConfigurationPage.tsx:seed":
        "Seeds the picker's DEFAULT SELECTION only — the value the replacement would submit, not a " +
        "statement of what the membership holds. The card states the union separately.",
    "AccessRolesConfigurationPage.tsx:type":
        "Field of the API payload type, kept so the shape does not silently drop half the record. " +
        "Every predicate in this chapter reads role_keys via memberHoldsRole/heldRoleKeys.",
};

function classifyPrimaryRoleUse(line: string): keyof typeof PRIMARY_ROLE_EXEMPT | "unclassified" | null {
    const trimmed = line.trim();
    if (!trimmed.includes("primary_role")) return null;
    if (/^primary_role\s*:/.test(trimmed)) return "type";
    if (/setEditRole\(/.test(trimmed)) return "seed";
    return "unclassified";
}

describe("IA-7 tier A — no Access chapter states a role claim from the collapsed value", () => {
    const files = walk(ACCESS_COMPONENTS);

    it("discovers the Access chapter components from disk", () => {
        // Non-vacuity for the subject itself: a walk that found nothing would pass every check below.
        expect(files.length).toBeGreaterThan(3);
        expect(files.some((f) => f.endsWith("AccessUsersConfigurationPage.tsx"))).toBe(true);
        expect(files.some((f) => f.endsWith("AccessRolesConfigurationPage.tsx"))).toBe(true);
    });

    it("every surviving primary_role occurrence is declared, with a reason of substance", () => {
        const undeclared: string[] = [];
        for (const file of files) {
            const name = path.basename(file);
            const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
            lines.forEach((line, index) => {
                const kind = classifyPrimaryRoleUse(line);
                if (kind === null) return;
                if (kind === "unclassified") {
                    undeclared.push(`${name}:${index + 1} ${line.trim()}`);
                    return;
                }
                const reason = PRIMARY_ROLE_EXEMPT[`${name}:${kind}`];
                if (!reason || reason.length < 40) undeclared.push(`${name}:${index + 1} (undeclared ${kind})`);
            });
        }
        expect(undeclared).toEqual([]);
    });

    it("convicts the predicates this workstream removed", () => {
        // Non-vacuity, against the two exact lines that were in the tree before this commit.
        expect(classifyPrimaryRoleUse("        map.set(m.primary_role, (map.get(m.primary_role) ?? 0) + 1);")).toBe(
            "unclassified",
        );
        expect(classifyPrimaryRoleUse("        () => members.filter((m) => m.primary_role === selected.role_key),")).toBe(
            "unclassified",
        );
        expect(classifyPrimaryRoleUse("{roleLabelFor(selected.primary_role)}")).toBe("unclassified");
        expect(classifyPrimaryRoleUse("disabled={roleSaving || editRole === selected.primary_role}")).toBe(
            "unclassified",
        );
        // …and passes the two that legitimately remain.
        expect(classifyPrimaryRoleUse("    primary_role: string;")).toBe("type");
        expect(classifyPrimaryRoleUse("        setEditRole(selected.primary_role);")).toBe("seed");
        expect(classifyPrimaryRoleUse("        const held = roleKeys;")).toBeNull();
    });

    it("no Access chapter asserts a one-role model", () => {
        // The literal sentence IA-7 names, plus the shape of it. `user_roles` is keyed on
        // (user_id, org_id, role); a product sentence saying otherwise describes the picker.
        const ONE_ROLE_CLAIMS = [/One role is supported/i, /only one role per user/i, /a single role per user/i];
        const offenders: string[] = [];
        for (const file of files) {
            // Comments are stripped: a comment recording that this sentence was removed, and why,
            // is documentation of the fix rather than a claim made to the operator. The subject is
            // what renders.
            const source = stripComments(fs.readFileSync(file, "utf8"));
            for (const claim of ONE_ROLE_CLAIMS) {
                if (claim.test(source)) offenders.push(`${path.basename(file)} :: ${claim}`);
            }
        }
        expect(offenders).toEqual([]);
        // Non-vacuity: the removed sentence is still convicted by the pattern.
        expect(ONE_ROLE_CLAIMS.some((c) => c.test("One role is supported per user today."))).toBe(true);
    });
});

describe("M2-17 tier A — the destructive replacement is guarded in front of the write", () => {
    const source = stripComments(fs.readFileSync(USERS_PAGE, "utf8"));

    it("asks the projection rather than comparing to the collapsed value", () => {
        expect(source).toContain("replacementIsNoOp(selected, editRole)");
        expect(source).toContain("rolesDiscardedByReplacement(selected, editRole)");
        // The old guard, which removed the benign no-op and left only the damaging submission.
        expect(source).not.toContain("editRole === selected.primary_role");
    });

    it("guards saveRole itself, not only the button", () => {
        // A disabled attribute is a presentation fact. The write must refuse on its own terms, so
        // a stale render or a programmatic click cannot reach the destructive path.
        const saveRoleBody = source.slice(source.indexOf("const saveRole ="), source.indexOf("const saveScope"));
        expect(saveRoleBody.length).toBeGreaterThan(100);
        expect(saveRoleBody).toContain("if (replacementIsNoOp(selected, editRole)) return;");
        expect(saveRoleBody).toContain("!confirmRoleReplace) return;");
        // The guards precede the request, not follow it.
        expect(saveRoleBody.indexOf("!confirmRoleReplace) return;")).toBeLessThan(saveRoleBody.indexOf("method: \"PATCH\""));
    });

    it("the acknowledgement cannot outlive the statement it was given for", () => {
        // Reset on selection change and on target change; otherwise a confirmation collected for
        // one principal authorizes a deletion on the next.
        expect(source).toContain("setConfirmRoleReplace(false)");
        expect(source.match(/setConfirmRoleReplace\(false\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
});
