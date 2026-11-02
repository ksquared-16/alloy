/**
 * TYPES ONLY for `qaWorkflowVerifierPlaywright.mjs`, resolved by TypeScript ahead of the JavaScript. Node, tsx and
 * vitest still load the `.mjs`; nothing here runs.
 *
 * The driver reads only part of the verifier's policy, so it accepts a policy without the allowed origins/methods
 * (the judge already applies them) — the shape the driver's own tests hand it.
 */

import type { WorkflowCapture, WorkflowCaptureSpec } from "./qaWorkflowVerifier.mjs";

/** The page's own statement of who is signed in, or null. */
export declare function identityFromHtml(html: unknown): string | null;

export declare const REVEAL_QUIET_MS: 500;

export type NetworkQuietPage = { on(event: string, listener: () => void): unknown };

export declare function trackNetworkQuiet(
    page: NetworkQuietPage,
    opts?: { quietMs?: number; now?: () => number; sleep?: (ms: number) => Promise<unknown> },
): { settled(timeoutMs: number): Promise<void> };

export type PlaywrightDriverPolicy = Readonly<{
    baseOrigin: string;
    storageStatePath: string;
    allowedOrigins?: readonly string[];
    allowedMethods?: readonly string[];
    reveal: readonly string[];
    capture: readonly WorkflowCaptureSpec[];
    judge: (method: string, url: string) => { ok: boolean };
}>;

export type PlaywrightVisit = {
    finalUrl: string;
    identity: string | null;
    requests: { method: string; url: string; blocked: boolean }[];
    snapshot: Record<string, WorkflowCapture[]>;
};

export type PlaywrightWorkflowSession = {
    visit(path: string): Promise<PlaywrightVisit>;
    close(): Promise<void>;
};

export declare function createPlaywrightWorkflowDriver(opts?: {
    loadPlaywright?: () => Promise<{ chromium: unknown }>;
    timeoutMs?: number;
    quietMs?: number;
}): {
    kind: "playwright";
    open(policy: PlaywrightDriverPolicy): Promise<PlaywrightWorkflowSession>;
};
