import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { COMMS_V2_FLAG_KEYS, isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";

/**
 * PKG-01 — Communications V2 doctrine guardrails (contract tests).
 *
 * These encode locked doctrine as structural assertions. Scans are scoped to the
 * Communications V2 namespace(s) this program owns, so the rules bite as V2 grows
 * without flaking on unrelated existing code. Later packages MUST keep these green:
 *  - no generic-inbox / folder-as-primary regression (queue is operational-state keyed)
 *  - no BOS panels embedded in V2 content (BOS only via the command rail)
 *  - no provider-specific branching outside the (future) provider adapter dir
 *  - no auto-send path (BOS stays review-first)
 *  - all comms_v2_* flags default OFF
 *
 * Mirrors the scan style of `adminV2BosTerminology.contract.test.ts`.
 */

const WEB_ROOT = join(process.cwd());

/** V2-owned source roots. Some do not exist until later packages land — that is fine. */
const V2_SCAN_ROOTS = [
    "lib/communications/v2",
    "app/adminV2/communications",
    "components/adminV2/communications/v2",
];

/** Provider-specific logic is allowed ONLY under this dir (created in PKG-06). */
const PROVIDER_ALLOW_DIR = join("lib", "communications", "providers");

function collectTsFiles(absRoot: string): string[] {
    if (!existsSync(absRoot)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(absRoot)) {
        const abs = join(absRoot, entry);
        const st = statSync(abs);
        if (st.isDirectory()) out.push(...collectTsFiles(abs));
        else if ([".ts", ".tsx"].includes(extname(entry))) out.push(abs);
    }
    return out;
}

function v2Files(): { abs: string; rel: string; src: string }[] {
    const files: { abs: string; rel: string; src: string }[] = [];
    for (const root of V2_SCAN_ROOTS) {
        for (const abs of collectTsFiles(join(WEB_ROOT, root))) {
            files.push({ abs, rel: abs.slice(WEB_ROOT.length + 1), src: readFileSync(abs, "utf8") });
        }
    }
    return files;
}

describe("Communications V2 doctrine guardrails", () => {
    it("scans a non-empty V2 namespace (foundation exists)", () => {
        // PKG-01 creates lib/communications/v2 — at least one file must be present.
        expect(v2Files().length).toBeGreaterThan(0);
    });

    it("introduces no auto-send path (BOS stays review-first)", () => {
        const offenders = v2Files()
            .filter((f) => /\bauto[_-]?send\b/i.test(f.src))
            .map((f) => f.rel);
        expect(offenders, `auto-send symbols found in: ${offenders.join(", ")}`).toEqual([]);
    });

    it("keeps provider-specific branching out of the application layer", () => {
        const re = /provider\s*===\s*['"`](twilio|resend|google|microsoft|m365|gmail)['"`]/i;
        const offenders = v2Files()
            .filter((f) => !f.rel.includes(PROVIDER_ALLOW_DIR) && re.test(f.src))
            .map((f) => f.rel);
        expect(offenders, `provider branching outside adapters in: ${offenders.join(", ")}`).toEqual([]);
    });

    it("does not embed BOS panels inside V2 content", () => {
        // BOS is mounted only via the command rail host; V2 content must not import BOS panels directly.
        const re = /from\s+['"][^'"]*(CommandRailBosMount|aiCommandSurface\/[A-Za-z]*Panel|adminV2\/bos\/[A-Za-z]*Panel)[^'"]*['"]/;
        const offenders = v2Files()
            .filter((f) => re.test(f.src))
            .map((f) => f.rel);
        expect(offenders, `direct BOS panel imports in V2 content: ${offenders.join(", ")}`).toEqual([]);
    });

    it("defaults every comms_v2_* flag OFF without explicit enablement", () => {
        for (const key of COMMS_V2_FLAG_KEYS) {
            const name = `NEXT_PUBLIC_${key.toUpperCase()}`;
            const prev = process.env[name];
            delete process.env[name];
            expect(isCommsV2FlagEnabled(key)).toBe(false);
            if (prev !== undefined) process.env[name] = prev;
        }
    });
});
