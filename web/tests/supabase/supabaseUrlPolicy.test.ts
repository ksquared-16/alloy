import { describe, expect, it } from "vitest";

import {
    assertValidSupabaseHttpUrl,
    isLoopbackHostname,
} from "@/lib/supabase/supabaseUrlPolicy";

const ok = (url: string) => expect(() => assertValidSupabaseHttpUrl(url)).not.toThrow();
const rejects = (url: string, match?: RegExp) =>
    expect(() => assertValidSupabaseHttpUrl(url)).toThrow(match);

describe("supabaseUrlPolicy — loopback HTTP is accepted", () => {
    it.each([
        "http://localhost:54321",
        "http://127.0.0.1:56321",
        "http://[::1]:56321",
        "http://127.0.0.1:55321", // the old hardcoded cert port still works, now without a flag
        "http://studio.localhost:3000",
        "http://127.9.9.9:1234", // all of 127.0.0.0/8 is loopback
    ])("accepts %s", (url) => ok(url));

    it("accepts loopback HTTP with no env flag set — the port is not what makes it safe", () => {
        delete process.env.PROCESSING_LOCAL_CERT_ALLOW_HTTP;
        // The regression that produced "must use https" on the approved local environment:
        // a local Supabase on a CLI-assigned port other than 55321.
        ok("http://127.0.0.1:56321");
    });

    it("accepts HTTPS on loopback too", () => ok("https://localhost:54321"));
});

describe("supabaseUrlPolicy — hosted rules are unchanged", () => {
    it("accepts a valid hosted HTTPS URL", () => ok("https://abcdefghijklmnopqrst.supabase.co"));

    it.each([
        "http://example-project.supabase.co",
        "http://db.example.com:8000",
        "http://10.0.0.5:54321", // private LAN is reachable off-box: not loopback
        "http://0.0.0.0:54321", // binds all interfaces; not a loopback destination
        "http://127.0.0.1.evil.com", // loopback-looking hostname that resolves elsewhere
    ])("rejects non-loopback HTTP %s", (url) => rejects(url, /must use https/i));

    it("names the offending host so the message is actionable", () =>
        rejects("http://example-project.supabase.co", /example-project\.supabase\.co is not loopback/));
});

describe("supabaseUrlPolicy — malformed and placeholder", () => {
    it.each(["", "not-a-url", "://missing-scheme", "https://", "http://"])(
        "rejects malformed %s",
        (url) => rejects(url),
    );

    it("rejects a non-http(s) scheme", () => rejects("ftp://example.supabase.co", /must use https/i));

    it.each([
        "https://your_project_ref.supabase.co",
        "https://placeholder.supabase.co",
        "https://example.supabase.co",
    ])("rejects placeholder %s", (url) => rejects(url, /placeholder/i));
});

describe("isLoopbackHostname", () => {
    it.each(["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]", "app.localhost"])(
        "%s is loopback",
        (h) => expect(isLoopbackHostname(h)).toBe(true),
    );

    it.each(["example.com", "0.0.0.0", "10.0.0.5", "192.168.1.10", "127.0.0.1.evil.com", "::2"])(
        "%s is not loopback",
        (h) => expect(isLoopbackHostname(h)).toBe(false),
    );
});
