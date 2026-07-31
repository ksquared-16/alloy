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
    reporter: [["list"], ["html", { outputFolder: "./evidence/report", open: "never" }]],
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
