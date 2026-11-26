/**
 * `dev:qa:financials-historical-draft-fixture --ensure | --verify | --reset | --count`
 *
 * Registry entry `financials_historical_draft` (installed toolkit, lib/certification-fixture.mjs):
 * QA-bound, run ONLY by Vacilando's isolated executor against one leased certenv, reserved
 * namespace `financials-cert.alloy.invalid`, reset_limit 50. The rule lives in
 * financialsHistoricalDraftFixtureCore.ts; this file is the boundary:
 *
 *   · the executor's v2 operation authority is judged FIRST (financialsFixtureAuthority.mjs over the shared
 *     isolatedFixtureAuthorityV2.mjs, program FINANCIALS_HISTORICAL_DRAFT_PROGRAM: in-flight request, exact
 *     record bytes, expiry, this operation / script / candidate, the persona organization the executor's
 *     QA-run ledger binds and the record names, the database connection identity, the clear target hold
 *     and the record's API identity = SUPABASE_URL), then the binding (financialsIsolatedBinding.mjs). A v1
 *     record, or one without `api_identity`, is refused — no fallback. Immediately before the client, the exact
 *     configuration it is handed (DATABASE_URL, this environment, the attested API origin) is attested again
 *     (runAttestedFinancialsConnection) and the client is built from that frozen copy. Any refusal exits 2
 *     before any client exists or the credential is used — no connection is attempted;
 *   · the fixture acts ONLY in that verified organization, passed to the core. There is no default
 *     organization and no seed-org fallback;
 *   · the service credential is read from the executor-built environment straight into the client
 *     and never printed; output is fixture ids, ✓/✗ checks built from fixed text and counts, stable
 *     diagnostic codes, and the executor's `reset …` / `census …` lines — never an exception, backend
 *     or process message;
 *   · exit 0 ok · 1 failed · 2 refused before IO · 3 identity conflict for the operator.
 *
 * `--count` (`census count=<n>`) is registered (`count: { args: ["--count"], mutating: false, census: true }`).
 *
 * `--ui-verify` (READ-ONLY, rendered): after the same authority, binding and attested domain read of the one draft,
 * the shared workflow verifier (`qaWorkflowVerifier.mjs`) renders the fixture child's Financials record as the bound
 * persona on the bound candidate preview, through the Financials adapter (`financialsHistoricalDraftUi.ts`). It needs
 * the platform to register `ui-verify: { args: ["--ui-verify"], mutating: false }` for this fixture and to pass
 * `ALLOY_QA_IDENTITY_EMAIL` (FINANCIALS-REUSABLE-QA-SETUP-CONTRACT); until then the executor never runs it.
 */
import { createClient } from "@supabase/supabase-js";

import { FINANCIALS_HISTORICAL_DRAFT_PROGRAM, runAttestedFinancialsConnection, verifyFinancialsFixtureAuthority } from "./financialsFixtureAuthority.mjs";
import { describeBinding, readIsolatedBinding } from "./financialsIsolatedBinding.mjs";
import {
    censusHistoricalDraft,
    ensureHistoricalDraft,
    FixtureError,
    NAMESPACE,
    resetHistoricalDraft,
    readHistoricalDraftUiSubject,
    verifyHistoricalDraft,
    type FixtureOutcome,
} from "./financialsHistoricalDraftFixtureCore";
import { FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER } from "./financialsHistoricalDraftUi";
import { readWorkflowBinding, runWorkflowVerification, workflowVerificationLines } from "./qaWorkflowVerifier.mjs";
import { createPlaywrightWorkflowDriver } from "./qaWorkflowVerifierPlaywright.mjs";

const OPERATIONS = { "--ensure": "ensure", "--verify": "verify", "--reset": "reset", "--count": "count", "--ui-verify": "ui-verify" } as const;

/** Verifier options other than the program and operation (tests pass a synthetic store root); never from `env`. */
type AuthorityOptions = Omit<NonNullable<Parameters<typeof verifyFinancialsFixtureAuthority>[1]>, "program" | "operation">;
/** The rendered step's driver and clock; tests inject a fake driver — never a real browser. */
export type UiOptions = {
    driver?: Parameters<typeof runWorkflowVerification>[0]["driver"];
    readFile?: (p: string) => Buffer | string;
    nowMs?: () => number;
};

export async function main(
    env: NodeJS.ProcessEnv = process.env,
    argv: string[] = process.argv.slice(2),
    out: (line: string) => void = console.log,
    authority: AuthorityOptions = {},
    ui: UiOptions = {},
): Promise<number> {
    const operation = OPERATIONS[argv[0] as keyof typeof OPERATIONS];
    if (!operation) {
        out("✗ refused before any IO: argv_not_the_registered_vector — exactly one of --ensure, --verify, --reset, --count, --ui-verify");
        return 2;
    }
    /* Authority v2 FIRST: nothing below — binding, credential, client — runs for an unverified execution. */
    const auth = verifyFinancialsFixtureAuthority(env, { ...authority, program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation });
    if (!auth.ok || !auth.authority) {
        out(`✗ refused before any IO: ${auth.code}${auth.fields ? ` fields=${auth.fields.join(",")}` : ""}`);
        return 2;
    }
    const judged = readIsolatedBinding({ env, fixture: "financials_historical_draft", operation, argv });
    if (!judged.ok) {
        out(`✗ refused before any IO: ${judged.code} — ${judged.detail}`);
        return 2;
    }
    const org = auth.authority.org_id;
    out(`binding ${describeBinding(judged.binding)}`);
    if (operation === "ui-verify") return uiVerify(env, auth.authority, out, authority, ui);
    let result: FixtureOutcome;
    try {
        /* The gate, immediately before the client: the ATTESTED origin, frozen, never a second read of SUPABASE_URL. */
        const gated = await runAttestedFinancialsConnection(env, {
            ...authority, program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation,
            url: env.DATABASE_URL, clientEnv: env, apiOrigin: auth.authority.api_url,
            connect: (c) => {
                const db = createClient(String(c.apiOrigin), String(c.clientEnv.SUPABASE_SERVICE_ROLE_KEY), {
                    auth: { persistSession: false, autoRefreshToken: false },
                });
                return operation === "ensure" ? ensureHistoricalDraft(db, org)
                    : operation === "verify" ? verifyHistoricalDraft(db, org)
                    : operation === "count" ? censusHistoricalDraft(db, org)
                    : resetHistoricalDraft(db, org);
            },
        });
        if (!gated.ok || !("result" in gated)) {
            out(`✗ refused before any IO: ${gated.code}${gated.fields ? ` fields=${gated.fields.join(",")}` : ""}`);
            return 2;
        }
        result = gated.result;
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

/**
 * `--ui-verify`: the rendered binding is judged before any client or browser; the draft id comes from an attested
 * read-only domain read; the browser opens only after the authority is attested once more.
 */
async function uiVerify(
    env: NodeJS.ProcessEnv,
    verified: NonNullable<ReturnType<typeof verifyFinancialsFixtureAuthority>["authority"]>,
    out: (line: string) => void,
    authority: AuthorityOptions,
    ui: UiOptions,
): Promise<number> {
    const now = ui.nowMs ?? (() => Date.now());
    const bound = readWorkflowBinding(env, verified, { nowMs: now(), ...(ui.readFile ? { readFile: ui.readFile } : {}) });
    if (!bound.ok) {
        out(`✗ refused before any IO: ${bound.code}`);
        return 2;
    }
    let subject: Awaited<ReturnType<typeof readHistoricalDraftUiSubject>>;
    try {
        const gated = await runAttestedFinancialsConnection(env, {
            ...authority, program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation: "ui-verify",
            url: env.DATABASE_URL, clientEnv: env, apiOrigin: verified.api_url,
            connect: (c) => readHistoricalDraftUiSubject(createClient(String(c.apiOrigin), String(c.clientEnv.SUPABASE_SERVICE_ROLE_KEY), {
                auth: { persistSession: false, autoRefreshToken: false },
            }), verified.org_id),
        });
        if (!gated.ok || !("result" in gated)) {
            out(`✗ refused before any IO: ${gated.code}${gated.fields ? ` fields=${gated.fields.join(",")}` : ""}`);
            return 2;
        }
        subject = gated.result;
    } catch (e) {
        out(`✗ ui-verify failed: ${e instanceof FixtureError ? e.diagnostic : "unexpected_error"}`);
        return 1;
    }
    if (!subject.ok) {
        for (const c of subject.outcome.checks) out(`${c.ok ? "✓" : "✗"} ${c.check}`);
        return 1;
    }
    const result = await runWorkflowVerification({
        adapter: FINANCIALS_HISTORICAL_DRAFT_UI_ADAPTER,
        binding: bound.binding,
        driver: ui.driver ?? createPlaywrightWorkflowDriver(),
        attest: () => verifyFinancialsFixtureAuthority(env, { ...authority, program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation: "ui-verify" }),
        context: { draftChargeId: subject.draftChargeId },
        nowMs: now,
    });
    for (const line of workflowVerificationLines(result)) out(line);
    return result.refusal ? 2 : result.ok ? 0 : 1;
}

if (process.argv[1] && /financialsHistoricalDraftFixture\.ts$/.test(process.argv[1])) {
    main().then((code) => process.exit(code), () => {
        console.log("✗ runner failed: unexpected_error");
        process.exit(1);
    });
}
