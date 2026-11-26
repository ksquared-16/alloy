/**
 * Certification Playwright config — the canonical browser verification workflow.
 *
 * `setup` captures the operator session once; `certify` runs the evidence specs
 * against the running app reusing that session. Screenshots/video/trace land in
 * ./evidence for every run. Invoked by `alloy-certify verify`.
 */
import { defineConfig } from "@playwright/test";
import path from "node:path";

const AUTH_FILE = path.join(__dirname, ".auth", "operator.json");

export default defineConfig({
    testDir: "./playwright",
    outputDir: "./evidence/.trace",
    // 60s was a budget for a WARM dev server. A cold Turbopack compile of the admin routes alone
    // can consume most of it, so tests were failing on compile latency after every one of their
    // product assertions had already passed. This is an environment allowance, not a loosened
    // assertion — nothing about what the specs prove changes.
    timeout: Number(process.env.CERT_TIMEOUT_MS || 240_000),
    fullyParallel: false,
    // fullyParallel:false only serializes tests WITHIN a file — separate spec files still run
    // concurrently. Every spec drives the same single tenant and the same business-process
    // configuration, so two workers edit one draft: the platform's optimistic-concurrency guard
    // correctly answers 409 ("someone else changed this configuration while you were editing"),
    // and revision counts drift under whichever spec published last.
    //
    // Observed directly at 2 workers: S2 got 409, G3 saw revisionCount 2 instead of 1, and T0
    // read a rule set another file had just republished. Those are the platform defending itself,
    // not product defects — but they make the certification unable to prove anything.
    //
    // The certification is a serial proving journey against one tenant. It is correct at exactly
    // one worker. CERT_WORKERS can raise it, but nothing about this suite is parallel-safe today.
    workers: Number(process.env.CERT_WORKERS || 1),
    // Redaction first — see web/playwright/redactingReporter.ts. Certification runs
    // authenticated against a seeded tenant, so a failure would otherwise print the
    // operator session into evidence that gets committed.
    reporter: [
        [path.join(__dirname, "..", "web", "playwright", "redactingReporter.ts")],
        ["list"],
        ["html", { outputFolder: "./evidence/report", open: "never" }],
    ],
    use: {
        baseURL: process.env.CERT_APP_URL || "http://localhost:3011",
        screenshot: "on",
        video: "retain-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "setup", testMatch: /auth\.setup\.ts/ },
        {
            name: "certify",
            testMatch: /\.cert\.spec\.ts/,
            dependencies: ["setup"],
            use: { storageState: AUTH_FILE },
        },
    ],
});
