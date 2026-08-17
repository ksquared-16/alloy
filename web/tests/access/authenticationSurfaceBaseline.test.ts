/**
 * W-30 (`RL-37`), W-31 (partial), W-32 (`RL-29`, sign-in half) — Wave 8's three no-decision
 * workstreams.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §18. *"Sitting 3
 * gates six of eight workstreams; **`W-30`, `W-31` and `W-32` wait on nothing.**"*
 *
 * All three of §18's measurements were re-verified against source this session rather than inherited:
 * three password inputs and zero reveal toggles; `length >= 6` in a submit handler and nowhere else;
 * and the raw provider error rendered at the sign-in path.
 *
 * The locks below are stated over the surface tree with the subject DISCOVERED, because the shape
 * these three workstreams are exposed to is a fourth password field or a fifth error branch arriving
 * later — which is the failure `W-5` named and this initiative has now paid for five times.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
    PASSWORD_FIELD_STARTS_HIDDEN,
    passwordFieldPresentation,
    togglePasswordReveal,
} from "@/lib/auth/passwordFieldPresentation";
import { PASSWORD_POLICY, passwordChangeViolation, passwordPolicyViolation } from "@/lib/auth/passwordPolicy";
import {
    SIGN_IN_MESSAGES,
    classifySignInFailure,
    passwordUpdateErrorMessage,
    signInErrorMessage,
} from "@/lib/auth/signInErrorMessage";
import { stripComments } from "./membershipRevocationTruthScan.test";

const webRoot = join(__dirname, "..", "..");

function sourceFilesUnder(rel: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = join(abs, entry.name);
            if (entry.isDirectory()) walk(child);
            else if (/\.tsx?$/.test(entry.name)) out.push(child);
        }
    };
    walk(join(webRoot, rel));
    return out;
}

const cache = new Map<string, string>();
function code(abs: string): string {
    let src = cache.get(abs);
    if (src === undefined) {
        src = stripComments(readFileSync(abs, "utf8"));
        cache.set(abs, src);
    }
    return src;
}

const rel = (abs: string) => relative(webRoot, abs).split("\\").join("/");

/* ------------------------------------------------------------------ W-30, tier B */

describe("W-30 / IA-R10 — the show/hide baseline", () => {
    it("defaults to hidden, and the default is the property rather than a caller's literal", () => {
        expect(PASSWORD_FIELD_STARTS_HIDDEN).toBe(false);
        expect(passwordFieldPresentation().inputType).toBe("password");
        expect(passwordFieldPresentation(PASSWORD_FIELD_STARTS_HIDDEN).inputType).toBe("password");
    });

    it("names the action for assistive tech and reports the state separately", () => {
        const hidden = passwordFieldPresentation(false);
        expect(hidden.toggleLabel).toBe("Show password");
        expect(hidden.ariaPressed).toBe("false");

        const shown = passwordFieldPresentation(true);
        expect(shown.inputType).toBe("text");
        expect(shown.toggleLabel).toBe("Hide password");
        expect(shown.ariaPressed).toBe("true");
    });

    it("reveals only by an explicit toggle, and returns to hidden on the next one", () => {
        // "Never auto-reveals": the single transition into a revealed state in the product.
        expect(togglePasswordReveal(PASSWORD_FIELD_STARTS_HIDDEN)).toBe(true);
        expect(togglePasswordReveal(togglePasswordReveal(PASSWORD_FIELD_STARTS_HIDDEN))).toBe(false);
    });
});

/* --------------------------------------------------- W-30, tier A: RL-37's subject */

const SHARED_FIELD = "components/auth/PasswordField.tsx";
const PRESENTATION = "lib/auth/passwordFieldPresentation.ts";

const PASSWORD_INPUT = /type=\{?["']password["']\}?/;
const PASSWORD_INPUT_G = /type=\{?["']password["']\}?/g;

/**
 * The ONE exemption class `RL-37` admits, and the reason it is not a hole.
 *
 * `W-30`'s subject is the **authentication** password: a value a person types to prove they are
 * themselves, which they may need to see to type correctly, which a policy constrains, and which
 * the browser should offer to manage. Centralising those three decisions in one component is the
 * whole of the workstream.
 *
 * A write-only provider secret is none of those things. It authenticates *Alloy to a third party*,
 * not a person to Alloy; the product states it is never shown again once stored; and no password
 * policy governs a credential another vendor issued. Routing it through `PasswordField` would not
 * centralise an authentication decision — it would add a reveal control to a stored organizational
 * credential, which is a different product question with a different answer.
 *
 * **The grain is the FIELD, not the file.** An entry names one input by its `data-testid`, and the
 * lock asserts the file's password-input COUNT equals the number of entries registered against it.
 * So a new password input added to an already-exempt file is a violation, and the exemption cannot
 * be widened by editing the file it names. There is no path prefix, no glob and no wildcard —
 * asserted below, not merely intended.
 */
type WriteOnlySecretField = {
    /** Exact repo-relative path. Asserted to exist and to contain no pattern metacharacter. */
    readonly file: string;
    /** The input's `data-testid`. Asserted to be present in that file. */
    readonly testId: string;
    /** Why this specific field is not an authentication password. Asserted >= 40 characters. */
    readonly reason: string;
};

const WRITE_ONLY_PROVIDER_SECRETS: readonly WriteOnlySecretField[] = [
    {
        file: "components/adminV2/settings/organization/CommunicationsChannelDialog.tsx",
        testId: "communications-dialog-twilio-token",
        reason:
            "Twilio Auth Token — the organization's outbound SMS provider credential. It authenticates "
            + "Alloy to Twilio rather than a person to Alloy, is stored write-only and never rendered "
            + "back to the operator, and is governed by Twilio's key format rather than PASSWORD_POLICY.",
    },
    {
        file: "components/adminV2/settings/organization/CommunicationsChannelDialog.tsx",
        testId: "communications-dialog-resend-key",
        reason:
            "Resend API key — the organization's outbound email provider credential, on the same terms "
            + "as the Twilio token above: machine-to-machine, write-only, never shown again once stored, "
            + "and not subject to the authentication password policy W-30 centralises.",
    },
];

type DiscoveredPasswordFile = {
    readonly file: string;
    readonly passwordInputs: number;
    readonly testIds: readonly string[];
};

/** Every file that renders a password input, found rather than listed. */
function discoverPasswordInputFiles(): DiscoveredPasswordFile[] {
    return [...sourceFilesUnder("app"), ...sourceFilesUnder("components")]
        .map((abs) => ({ file: rel(abs), src: code(abs) }))
        .filter(({ src }) => PASSWORD_INPUT.test(src))
        .map(({ file, src }) => ({
            file,
            passwordInputs: (src.match(PASSWORD_INPUT_G) ?? []).length,
            testIds: [...src.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]),
        }))
        .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Pure so the positive controls below can feed it fabricated discoveries. A file survives only by
 * being the shared component itself, or by having EVERY one of its password inputs registered.
 */
function rl37Violations(
    discovered: readonly DiscoveredPasswordFile[],
    register: readonly WriteOnlySecretField[],
): string[] {
    const out: string[] = [];
    for (const found of discovered) {
        if (found.file === SHARED_FIELD || found.file === PRESENTATION) continue;
        const entries = register.filter((e) => e.file === found.file);
        if (entries.length === 0) {
            out.push(
                `${found.file} — renders a password input and is not a registered write-only provider secret; `
                + "render @/components/auth/PasswordField instead",
            );
            continue;
        }
        const absent = entries.filter((e) => !found.testIds.includes(e.testId)).map((e) => e.testId);
        if (absent.length > 0) {
            out.push(`${found.file} — registered field(s) no longer present: ${absent.sort().join(", ")}`);
        }
        if (found.passwordInputs !== entries.length) {
            out.push(
                `${found.file} — ${found.passwordInputs} password input(s) but ${entries.length} registered; `
                + "a new input is not covered by an existing exemption",
            );
        }
    }
    return out.sort();
}

describe("W-30 / RL-37 — one component owns every password field", () => {
    it("no bare type=\"password\" outside the shared component or a registered write-only secret", () => {
        expect(
            rl37Violations(discoverPasswordInputFiles(), WRITE_ONLY_PROVIDER_SECRETS),
            "render @/components/auth/PasswordField — a second password input is a second set of "
                + "show/hide, autocomplete and policy decisions, which is what RL-37 exists to prevent",
        ).toEqual([]);
    });

    it("the shared component gets its semantics from the presentation module", () => {
        const src = code(join(webRoot, SHARED_FIELD));
        expect(src).toContain("passwordFieldPresentation");
        expect(src).toContain("PASSWORD_FIELD_STARTS_HIDDEN");
        // The literal must not reappear beside the derived value; that is how a default drifts.
        expect(src).not.toMatch(/useState\(\s*(?:true|false)\s*\)/);
    });

    it("never persists or logs the revealed state", () => {
        const src = code(join(webRoot, SHARED_FIELD));
        for (const forbidden of ["localStorage", "sessionStorage", "document.cookie", "console."]) {
            expect(src, `${forbidden} in the shared password field`).not.toContain(forbidden);
        }
    });

    it("still finds the three fields the product has, so discovery has not stopped matching", () => {
        // If the regex silently stops matching, the lock above passes by agreeing with nothing.
        const usingShared = [...sourceFilesUnder("app")]
            .filter((abs) => /<PasswordField\b/.test(code(abs)))
            .map(rel)
            .sort();
        expect(usingShared).toEqual(["app/login/page.tsx", "app/reset-password/page.tsx"]);
        const fields = code(join(webRoot, "app/reset-password/page.tsx")).match(/<PasswordField\b/g) ?? [];
        expect(fields).toHaveLength(2);
    });

    /* ------------------------------------- the exemption register cannot rot or widen */

    it("names exact files, never a prefix, glob or wildcard", () => {
        for (const entry of WRITE_ONLY_PROVIDER_SECRETS) {
            expect(entry.file, `${entry.file} contains a pattern metacharacter`).not.toMatch(/[*?[\]{}]/);
            expect(entry.file, `${entry.file} is a directory prefix, not a file`).toMatch(/\.tsx?$/);
            expect(existsSync(join(webRoot, entry.file)), `${entry.file} does not exist`).toBe(true);
        }
    });

    it("states a semantic reason per field, and never exempts the shared component itself", () => {
        for (const entry of WRITE_ONLY_PROVIDER_SECRETS) {
            expect(entry.reason.length, `${entry.testId} reason is too short to be a reason`)
                .toBeGreaterThanOrEqual(40);
            expect([SHARED_FIELD, PRESENTATION]).not.toContain(entry.file);
        }
        const ids = WRITE_ONLY_PROVIDER_SECRETS.map((e) => `${e.file}#${e.testId}`);
        expect(new Set(ids).size, "duplicate entry — one field, one exemption").toBe(ids.length);
    });

    it("every registered field is still on the surface it claims", () => {
        // A stale exemption is a hole that outlives the input it was written for.
        for (const entry of WRITE_ONLY_PROVIDER_SECRETS) {
            const src = code(join(webRoot, entry.file));
            expect(src, `${entry.testId} is registered but absent from ${entry.file}`)
                .toContain(`data-testid="${entry.testId}"`);
        }
    });

    /* ------------------------------------------------ positive controls on the filter */

    it("still convicts an unregistered file that renders a password input", () => {
        expect(
            rl37Violations(
                [{ file: "components/some/NewThing.tsx", passwordInputs: 1, testIds: ["x"] }],
                WRITE_ONLY_PROVIDER_SECRETS,
            ),
        ).toHaveLength(1);
    });

    it("convicts a NEW password input added to an already-exempt file", () => {
        // The exemption is per field. Editing the exempt file must not widen it.
        const exempt = WRITE_ONLY_PROVIDER_SECRETS[0].file;
        const registered = WRITE_ONLY_PROVIDER_SECRETS.filter((e) => e.file === exempt);
        const violations = rl37Violations(
            [{
                file: exempt,
                passwordInputs: registered.length + 1,
                testIds: [...registered.map((e) => e.testId), "communications-dialog-something-new"],
            }],
            WRITE_ONLY_PROVIDER_SECRETS,
        );
        expect(violations).toHaveLength(1);
        expect(violations[0]).toContain("not covered by an existing exemption");
    });

    it("convicts a registered field that has disappeared from its file", () => {
        const exempt = WRITE_ONLY_PROVIDER_SECRETS[0];
        const violations = rl37Violations(
            [{ file: exempt.file, passwordInputs: 0, testIds: [] }],
            [exempt],
        );
        expect(violations.join(" ")).toContain("no longer present");
    });

    it("does not exempt a different file that happens to reuse an exempt testId", () => {
        expect(
            rl37Violations(
                [{
                    file: "components/other/Copycat.tsx",
                    passwordInputs: 1,
                    testIds: [WRITE_ONLY_PROVIDER_SECRETS[0].testId],
                }],
                WRITE_ONLY_PROVIDER_SECRETS,
            ),
        ).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ W-31, tier B */

describe("W-31 / I-34 — the policy has one definition", () => {
    it("accepts the boundary and refuses just below it", () => {
        expect(passwordPolicyViolation("a".repeat(PASSWORD_POLICY.minLength))).toBeNull();
        expect(passwordPolicyViolation("a".repeat(PASSWORD_POLICY.minLength - 1))).toContain(
            `at least ${PASSWORD_POLICY.minLength}`,
        );
    });

    it("refuses an empty or non-string password rather than passing it to the provider", () => {
        expect(passwordPolicyViolation("")).toBe("Enter a password.");
        expect(passwordPolicyViolation(undefined)).toBe("Enter a password.");
        expect(passwordPolicyViolation(null)).toBe("Enter a password.");
        expect(passwordPolicyViolation(123456)).toBe("Enter a password.");
    });

    it("reports a mismatch before a policy violation, because that is the likelier operator error", () => {
        expect(passwordChangeViolation("abcdef", "abcdeg")).toBe("Passwords do not match.");
        expect(passwordChangeViolation("abc", "abc")).toContain("at least");
        expect(passwordChangeViolation("abcdef", "abcdef")).toBeNull();
    });

    it("is the only definition of the policy in the product", () => {
        // W-31's exit is "a policy expressed only in a submit handler no longer exists". The submit
        // handler now asks; a second inline length comparison anywhere in the auth surfaces is drift.
        const inline = [...sourceFilesUnder("app"), ...sourceFilesUnder("components")]
            .filter((abs) => /password[^\n]{0,40}\.length\s*[<>]=?\s*\d/i.test(code(abs)))
            .map(rel);
        expect(inline, "ask passwordPolicyViolation instead of comparing a length inline").toEqual([]);
    });

    it("records that W-31 is NOT closed, in the module rather than only in a report", () => {
        // The one claim a future session must not lose: there is no server-side enforcement point.
        const src = readFileSync(join(webRoot, "lib/auth/passwordPolicy.ts"), "utf8");
        expect(src).toContain("NOT closed");
        expect(src).toMatch(/no server/i);
    });
});

/* ------------------------------------------------------------------ W-32, tier B */

describe("W-32 / I-33 — no provider string reaches the sign-in surface", () => {
    it("collapses every account-state message onto one answer", () => {
        // The enumeration oracle: these three are different facts about an ACCOUNT and the product
        // must not distinguish them. `Email not confirmed` is the one that leaks existence outright.
        const answers = new Set(
            [
                "Invalid login credentials",
                "Email not confirmed",
                "User not found",
                "Anonymous sign-ins are disabled",
            ].map((m) => signInErrorMessage(new Error(m))),
        );
        expect(answers.size).toBe(1);
        expect([...answers][0]).toContain("Email or password is incorrect");
    });

    it("defaults an UNRECOGNISED provider string to the credential answer", () => {
        // The load-bearing direction. A classifier that passes unknowns through is the defect with a
        // function around it, and providers add account-state messages over time.
        expect(classifySignInFailure(new Error("Signups not allowed for otp"))).toBe("credentials");
        expect(classifySignInFailure({ message: "some new provider wording" })).toBe("credentials");
        expect(classifySignInFailure(null)).toBe("credentials");
        expect(classifySignInFailure(undefined)).toBe("credentials");
    });

    it("never returns any part of the provider's own text", () => {
        const secret = "user 4f3a-not-confirmed@example.com is unconfirmed";
        const shown = signInErrorMessage(new Error(secret));
        expect(shown).not.toContain("4f3a");
        expect(shown).not.toContain("example.com");
        expect(SIGN_IN_MESSAGES).toContain(shown);
    });

    it("still distinguishes the two failures that are not about an account", () => {
        // Preserved deliberately: both are true of every caller and neither names an account, and
        // collapsing them sends an operator with a broken .env hunting for a credential problem.
        expect(classifySignInFailure(new Error("Missing NEXT_PUBLIC_SUPABASE_URL"))).toBe("misconfigured");
        expect(classifySignInFailure(new Error("Failed to fetch"))).toBe("unreachable");
        expect(classifySignInFailure(new Error("Request rate limit reached"))).toBe("rate_limited");
    });

    it("applies the same rule to the recovery path's password update", () => {
        const shown = passwordUpdateErrorMessage(new Error("New password should be different from the old password"));
        expect(shown).not.toContain("old password");
        expect(shown).toContain("could not be updated");
        // Infrastructure failures keep their own answer here too.
        expect(passwordUpdateErrorMessage(new Error("Failed to fetch"))).toContain("Could not reach");
    });
});

/* --------------------------------------------------- W-32, tier A: RL-29's subject */

/** Pages that talk to the auth provider from the browser — the unauthenticated boundary. */
function authSurfaceFiles(): string[] {
    return sourceFilesUnder("app")
        .filter((abs) => !abs.includes(join("app", "api")))
        .filter((abs) => /supabase\.auth\.\w+/.test(code(abs)))
        .sort();
}

describe("W-32 / RL-29 — the sign-in path renders a fixed string", () => {
    it("finds the auth surfaces (discovery anchor)", () => {
        const found = authSurfaceFiles().map(rel);
        expect(found).toContain("app/login/page.tsx");
        expect(found).toContain("app/reset-password/page.tsx");
    });

    it("no auth surface puts a provider error's own message into user-visible state", () => {
        const leaking: { file: string; match: string }[] = [];
        // `setError(err.message)`, `setError(x.message || "…")`, `String(err)` — the shapes that
        // reach the screen. The mapper's own call sites pass the ERROR, never its text.
        const LEAK = /set\w*Error\(\s*[^)]*\.\bmessage\b|set\w*Error\(\s*String\(/g;
        for (const abs of authSurfaceFiles()) {
            for (const m of code(abs).matchAll(LEAK)) leaking.push({ file: rel(abs), match: m[0] });
        }
        expect(
            leaking,
            "map the error through signInErrorMessage / passwordUpdateErrorMessage — a provider "
                + "string on this boundary is an account-existence oracle (I-33, S-4)",
        ).toEqual([]);
    });

    it("both surfaces route their failures through the mapper", () => {
        expect(code(join(webRoot, "app/login/page.tsx"))).toContain("signInErrorMessage");
        expect(code(join(webRoot, "app/reset-password/page.tsx"))).toContain("passwordUpdateErrorMessage");
    });

    it("matches the discipline send-password-reset already applies", () => {
        // The comparison §18 asks for: the same rule, at both boundaries, from the same reasoning.
        const reset = code(join(webRoot, "app/api/admin/send-password-reset/route.ts"));
        expect(reset).toContain("If an account exists for that email");
    });
});

/* --------------------------------------------------------------------- non-vacuity */

describe("W-30/W-32 — the locks bite", () => {
    it("RL-37 names a file that renders its own password input", () => {
        // Proved against a synthetic source rather than by editing the tree: the check is the
        // predicate, so applying it to a violating string is a faithful reversion.
        const violating = `<input type="password" id="rogue" />`;
        expect(/type=\{?["']password["']\}?/.test(violating)).toBe(true);
    });

    it("RL-29 catches each leak shape it exists for, and does not fire on the mapper's call sites", () => {
        const LEAK = /set\w*Error\(\s*[^)]*\.\bmessage\b|set\w*Error\(\s*String\(/;
        expect(LEAK.test('setError(signInError.message || "x")')).toBe(true);
        expect(LEAK.test("setError(String(err))")).toBe(true);
        expect(LEAK.test("setInviteError(e.message)")).toBe(true);
        expect(LEAK.test("setError(signInErrorMessage(signInError))")).toBe(false);
        expect(LEAK.test('setError("Passwords do not match.")')).toBe(false);
    });
});
