/**
 * The operator session around a tenant command (briefing step 16): argument reading, the log the transcript
 * captures, and the typed confirmation. Shared by scripts/tenantCreate.ts and scripts/tenantConfigImport.ts.
 *
 * Every line printed is also appended to the `--log` file, with a UTC timestamp. Neither ever carries the key.
 */

import { appendFileSync } from "fs";
import { createInterface } from "readline";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
    OPERATOR_SERVICE_ROLE_KEY_ENV,
    resolveOperatorTarget,
    type ResolvedOperatorTarget,
} from "@/lib/tenancy/operatorTarget";

export function argValue(argv: readonly string[], name: string): string | null {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

export function argFlag(argv: readonly string[], name: string): boolean {
    return argv.includes(`--${name}`);
}

export class OperatorLog {
    constructor(
        readonly path: string,
        private readonly command: string,
    ) {}

    line(text: string): void {
        console.log(text);
        appendFileSync(this.path, `${new Date().toISOString()} [${this.command}] ${text}\n`);
    }

    fail(text: string, code = 1): never {
        console.error(`✗ ${text}`);
        appendFileSync(this.path, `${new Date().toISOString()} [${this.command}] FAILED: ${text}\n`);
        process.exit(code);
    }
}

/** The log path is required: step 16 files what the session printed. */
export function openOperatorLog(argv: readonly string[], command: string): OperatorLog {
    const path = argValue(argv, "log");
    if (!path) {
        console.error("✗ --log <file> is required (the step-16 transcript files it)");
        process.exit(3);
    }
    const log = new OperatorLog(path, command);
    log.line(`started: ${command} ${argv.filter((a) => !a.startsWith("eyJ")).join(" ")}`);
    return log;
}

/** The variables the app's own `createAdminClient` reads (lib/supabaseAdmin.ts). */
const APP_SUPABASE_ENV = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function resolveTargetFromArgs(argv: readonly string[], log: OperatorLog): ResolvedOperatorTarget {
    const resolved = resolveOperatorTarget({
        target: argValue(argv, "target"),
        supabaseUrl: argValue(argv, "supabase-url"),
        projectRef: argValue(argv, "project-ref"),
        alloyEnvironment: process.env.ALLOY_ENVIRONMENT ?? null,
        serviceRoleKey: process.env[OPERATOR_SERVICE_ROLE_KEY_ENV] ?? null,
    });
    if (!resolved.ok) log.fail(`refused (${resolved.code}): ${resolved.detail}`, 3);
    // Some app write paths build their own admin client from the environment (a cached read inside the work-unit
    // repair does). A session that already names a Supabase project is refused rather than trusted, and then those
    // variables are pinned to the explicit target, so no internal call can reach any other project.
    const preset = APP_SUPABASE_ENV.filter((k) => (process.env[k] ?? "").trim());
    if (preset.length) {
        log.fail(`refused (session_environment): ${preset.join(", ")} already set in this session; start a clean shell`, 3);
    }
    process.env.SUPABASE_URL = resolved.supabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_URL = resolved.supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = resolved.serviceRoleKey;
    installNoStoreNextCache();
    return resolved;
}

/**
 * Next's `unstable_cache` needs an incremental cache, which only a Next server has; outside one it throws. For an
 * operator command every read must be fresh anyway, so this installs a cache that never returns an entry and
 * stores nothing: each cached read runs its fetcher, as the uncached path would.
 */
function installNoStoreNextCache(): void {
    const g = globalThis as { __incrementalCache?: unknown };
    if (g.__incrementalCache) return;
    g.__incrementalCache = {
        isOnDemandRevalidate: false,
        generateCacheKey: async (key: string) => key,
        get: async () => null,
        set: async () => undefined,
        revalidateTag: async () => undefined,
    };
}

export function operatorClient(t: ResolvedOperatorTarget): SupabaseClient {
    return createClient(t.supabaseUrl, t.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}

/**
 * Ask the operator to type `expected` back. Anything else aborts. There is no flag that skips this: a scripted
 * rehearsal pipes the answer on stdin, which the log records like any other answer.
 */
export async function confirmByTyping(log: OperatorLog, prompt: string, expected: string): Promise<void> {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    process.stdout.write(`${prompt} Type ${JSON.stringify(expected)} to proceed: `);
    const answer = await new Promise<string>((resolve) => {
        let done = false;
        rl.once("line", (l) => {
            done = true;
            resolve(l.trim());
        });
        rl.once("close", () => {
            if (!done) resolve("");
        });
    });
    rl.close();
    process.stdout.write("\n");
    if (answer !== expected) log.fail(`not confirmed (typed ${JSON.stringify(answer)}); nothing was written`, 2);
    log.line(`confirmed: ${JSON.stringify(answer)}`);
}
