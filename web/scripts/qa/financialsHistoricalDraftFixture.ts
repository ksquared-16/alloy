/**
 * `dev:qa:financials-historical-draft-fixture --ensure | --verify | --reset | --count`
 *
 * Registry entry `financials_historical_draft` (installed toolkit, lib/certification-fixture.mjs):
 * QA-bound, run ONLY by Vacilando's isolated executor against one leased certenv, reserved
 * namespace `financials-cert.alloy.invalid`, reset_limit 50. The rule lives in
 * financialsHistoricalDraftFixtureCore.ts; this file is the boundary:
 *
 *   · the binding is judged first (financialsIsolatedBinding.mjs), then the executor's live operation
 *     authority (financialsFixtureAuthority.mjs, program FINANCIALS_HISTORICAL_DRAFT_PROGRAM: in-flight
 *     request, exact record bytes, expiry, this operation / script / candidate / target), and the
 *     persona organization the executor's QA-run ledger binds. Any refusal exits 2 before any client
 *     exists or the credential is read — no connection is attempted;
 *   · the fixture acts ONLY in that verified organization, passed to the core. There is no default
 *     organization and no seed-org fallback;
 *   · the service credential is read from the executor-built environment straight into the client
 *     and never printed; output is fixture ids, ✓/✗ checks built from fixed text and counts, stable
 *     diagnostic codes, and the executor's `reset …` / `census …` lines — never an exception, backend
 *     or process message;
 *   · exit 0 ok · 1 failed · 2 refused before IO · 3 identity conflict for the operator.
 *
 * `--count` (`census count=<n>`) is registered by A741 (`count: { args: ["--count"], mutating: false,
 * census: true }`); the installed toolkit refuses it until A741 is installed.
 */
import { createClient } from "@supabase/supabase-js";

import { FINANCIALS_HISTORICAL_DRAFT_PROGRAM, verifyFinancialsFixtureAuthority } from "./financialsFixtureAuthority.mjs";
import { describeBinding, readIsolatedBinding } from "./financialsIsolatedBinding.mjs";
import {
    censusHistoricalDraft,
    ensureHistoricalDraft,
    FixtureError,
    NAMESPACE,
    resetHistoricalDraft,
    verifyHistoricalDraft,
    type FixtureOutcome,
} from "./financialsHistoricalDraftFixtureCore";

const OPERATIONS = { "--ensure": "ensure", "--verify": "verify", "--reset": "reset", "--count": "count" } as const;

/** Verifier options other than the program and operation (tests pass a synthetic store root); never from `env`. */
type AuthorityOptions = Omit<NonNullable<Parameters<typeof verifyFinancialsFixtureAuthority>[1]>, "program" | "operation">;

export async function main(
    env: NodeJS.ProcessEnv = process.env,
    argv: string[] = process.argv.slice(2),
    out: (line: string) => void = console.log,
    authority: AuthorityOptions = {},
): Promise<number> {
    const operation = OPERATIONS[argv[0] as keyof typeof OPERATIONS];
    const judged = operation
        ? readIsolatedBinding({ env, fixture: "financials_historical_draft", operation, argv })
        : { ok: false as const, code: "argv_not_the_registered_vector", detail: "exactly one of --ensure, --verify, --reset" };
    if (!judged.ok) {
        out(`✗ refused before any IO: ${judged.code} — ${judged.detail}`);
        return 2;
    }
    const auth = verifyFinancialsFixtureAuthority(env, { ...authority, program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation });
    if (!auth.ok || !auth.authority) {
        out(`✗ refused before any IO: ${auth.code}${auth.fields ? ` fields=${auth.fields.join(",")}` : ""}`);
        return 2;
    }
    const org = auth.authority.org_id;
    out(`binding ${describeBinding(judged.binding)}`);
    let result: FixtureOutcome;
    try {
        const db = createClient(String(env.SUPABASE_URL), String(env.SUPABASE_SERVICE_ROLE_KEY), {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        result = operation === "ensure" ? await ensureHistoricalDraft(db, org)
            : operation === "verify" ? await verifyHistoricalDraft(db, org)
            : operation === "count" ? await censusHistoricalDraft(db, org)
            : await resetHistoricalDraft(db, org);
    } catch (e) {
        /* A code, never the message: backend and process text can carry row values or credentials. */
        out(`✗ ${operation} failed: ${e instanceof FixtureError ? e.diagnostic : "unexpected_error"}`);
        /* Reset throws only from its preflight reads, before the first delete — so zero is exact. */
        if (operation === "reset" && e instanceof FixtureError) out(`reset namespace=${NAMESPACE} removed=0`);
        return 1;
    }
    const last = (l: string) => l.startsWith("reset ") || l.startsWith("census ");
    for (const line of result.lines.filter((l) => !last(l))) out(line);
    for (const c of result.checks) out(`${c.ok ? "✓" : "✗"} ${c.check}`);
    for (const line of result.lines.filter(last)) out(line);
    return result.exitCode;
}

if (process.argv[1] && /financialsHistoricalDraftFixture\.ts$/.test(process.argv[1])) {
    main().then((code) => process.exit(code), () => {
        console.log("✗ runner failed: unexpected_error");
        process.exit(1);
    });
}
