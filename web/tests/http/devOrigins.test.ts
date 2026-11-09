/**
 * The periodic full-page refresh on tailnet-published lanes.
 *
 * Live on the Surfaces candidate preview (`https://vacilandos-mac-mini.tail2aa1af.ts.net:4410`,
 * `next dev`): the `/_next/webpack-hmr` upgrade opened for `Origin: http://localhost:4410` and was
 * refused for the tailnet origin, and serve.log recorded "Blocked cross-origin request from
 * vacilandos-mac-mini.tail2aa1af.ts.net to /_next/*". Next's HMR client then reloads the page after
 * 12 failed reconnects (~40 s) and starts over. These tests run Next's OWN dev guard against the
 * allowlist next.config.ts really produces, so they fail if the configured host stops being allowed
 * and if anything broader than that host gets in.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockCrossSite } from "next/dist/server/lib/router-utils/block-cross-site";

import {
    LOOPBACK_DEV_ORIGINS,
    allowedDevOriginsFor,
    configuredTailnetDevHost,
} from "@/lib/http/devOrigins";

const TAILNET_HOST = "vacilandos-mac-mini.tail2aa1af.ts.net";
const TAILNET_APP_URL = `https://${TAILNET_HOST}:4410`;

/** The browser's HMR WebSocket upgrade, as Next's router-server hands it to the guard. */
function hmrUpgrade(origin: string) {
    const req = {
        url: "/_next/webpack-hmr?id=abc",
        headers: { origin, "sec-fetch-mode": "websocket", "sec-fetch-site": "same-origin" },
    } as unknown as IncomingMessage;
    const res = { statusCode: 200, end: vi.fn() };
    return { req, res: res as unknown as ServerResponse & { end: ReturnType<typeof vi.fn> } };
}

function refused(allowed: string[], origin: string): boolean {
    const { req, res } = hmrUpgrade(origin);
    const blocked = blockCrossSite(req, res, allowed, undefined);
    expect(res.end.mock.calls.length > 0).toBe(blocked);
    return blocked;
}

describe("configuredTailnetDevHost", () => {
    it("reads the exact tailnet hostname from the configured app URL", () => {
        expect(configuredTailnetDevHost(TAILNET_APP_URL)).toBe(TAILNET_HOST);
        expect(configuredTailnetDevHost(`  https://${TAILNET_HOST.toUpperCase()}:3011/  `)).toBe(TAILNET_HOST);
    });

    it("adds nothing for loopback, hosted, malformed or absent app URLs", () => {
        for (const v of [
            undefined,
            null,
            "",
            "http://localhost:3011",
            "http://127.0.0.1:4410",
            "https://alloy-staging.vercel.app",
            "https://ts.net",
            "https://evil.example/?x=.ts.net",
            "not a url",
            "ftp://host.tail2aa1af.ts.net",
        ]) {
            expect(configuredTailnetDevHost(v), String(v)).toBeNull();
        }
    });

    it("adds nothing for any OTHER tailnet host, even when the app URL is changed to it", () => {
        for (const v of [
            "https://other-laptop.tail2aa1af.ts.net:4410",
            "https://vacilandos-mac-mini.othertail.ts.net:4410",
            `https://x.${TAILNET_HOST}:4410`,
            `https://${TAILNET_HOST}.evil.example:4410`,
        ]) {
            expect(configuredTailnetDevHost(v), v).toBeNull();
        }
    });
});

describe("allowedDevOriginsFor", () => {
    it("keeps loopback and adds only the configured tailnet host in dev", () => {
        expect(allowedDevOriginsFor({ appUrl: TAILNET_APP_URL, nodeEnv: "development" })).toEqual([
            ...LOOPBACK_DEV_ORIGINS,
            TAILNET_HOST,
        ]);
    });

    it("is loopback-only without a tailnet app URL and in a production build", () => {
        expect(allowedDevOriginsFor({ appUrl: "http://localhost:3011", nodeEnv: "development" })).toEqual([
            ...LOOPBACK_DEV_ORIGINS,
        ]);
        expect(allowedDevOriginsFor({ appUrl: TAILNET_APP_URL, nodeEnv: "production" })).toEqual([
            ...LOOPBACK_DEV_ORIGINS,
        ]);
    });

    it("never yields a wildcard", () => {
        for (const o of allowedDevOriginsFor({ appUrl: TAILNET_APP_URL, nodeEnv: "development" })) {
            expect(o).not.toContain("*");
        }
    });
});

describe("Next's dev guard on the HMR socket, with the allowlist next.config.ts produces", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    async function configuredAllowlist(appUrl: string, nodeEnv = "development"): Promise<string[]> {
        vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
        vi.stubEnv("NODE_ENV", nodeEnv);
        vi.resetModules();
        const mod = await import("../../next.config");
        return mod.default.allowedDevOrigins ?? [];
    }

    it("REGRESSION: the configured tailnet origin's HMR socket is accepted, so no reconnect-then-reload loop", async () => {
        const allowed = await configuredAllowlist(TAILNET_APP_URL);
        expect(refused(allowed, TAILNET_APP_URL)).toBe(false);
    });

    it("the pre-fix loopback-only allowlist refuses it (the reload cause)", () => {
        expect(refused([...LOOPBACK_DEV_ORIGINS], TAILNET_APP_URL)).toBe(true);
    });

    it("loopback origins keep working", async () => {
        const allowed = await configuredAllowlist(TAILNET_APP_URL);
        expect(refused(allowed, "http://localhost:4410")).toBe(false);
        expect(refused(allowed, "http://127.0.0.1:4410")).toBe(false);
    });

    it("any other origin is still refused — another tailnet machine, a lookalike, or a foreign site", async () => {
        const allowed = await configuredAllowlist(TAILNET_APP_URL);
        expect(refused(allowed, "https://other-laptop.tail2aa1af.ts.net:4410")).toBe(true);
        expect(refused(allowed, `https://${TAILNET_HOST}.evil.example`)).toBe(true);
        expect(refused(allowed, "https://evil.example")).toBe(true);
    });

    it("an app URL moved to another tailnet host opens nothing — that host stays refused", async () => {
        const other = "https://other-laptop.tail2aa1af.ts.net:4410";
        const allowed = await configuredAllowlist(other);
        expect(allowed).toEqual([...LOOPBACK_DEV_ORIGINS]);
        expect(refused(allowed, other)).toBe(true);
    });

    it("a lane without a tailnet app URL does not open its socket to the tailnet", async () => {
        const allowed = await configuredAllowlist("http://localhost:3011");
        expect(refused(allowed, TAILNET_APP_URL)).toBe(true);
    });
});
