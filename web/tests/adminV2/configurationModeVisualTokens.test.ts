/**
 * Configuration Mode — settings visual token drift prevention.
 * @see docs/sprints/06_2026/configuration-runtime-settings-visual-token-audit.md
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

const SETTINGS_DIRS = [
    join(root, "app/adminV2/settings"),
    join(root, "components/adminV2/settings"),
];

const FORBIDDEN_IN_SETTINGS = [
    /\balloy-blue\b/,
    /#31394d/i,
    /#59678b/i,
    /#e6e8ec/i,
    /#eef0f4/i,
    /#F4F6F9/i,
    /\bbg-blue-/,
    /\btext-blue-/,
    /\bborder-blue-/,
    /\bbg-slate-/,
    /\btext-slate-/,
    /\bborder-slate-/,
    /\bbg-gray-/,
    /\btext-gray-/,
    /\bborder-gray-/,
    /\bborder-admin-border\b/,
    /\bbg-sky-/,
    /\btext-sky-/,
    /\bborder-sky-/,
];

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) walk(path, acc);
        else if (/\.(tsx|ts|css)$/.test(name)) acc.push(path);
    }
    return acc;
}

function settingsFiles(): string[] {
    return SETTINGS_DIRS.flatMap((d) => walk(d));
}

describe("Configuration Mode settings visual tokens", () => {
    it("settings tree contains no legacy admin blue/slate/hex tokens", () => {
        const violations: string[] = [];
        for (const file of settingsFiles()) {
            const text = readFileSync(file, "utf8");
            for (const pattern of FORBIDDEN_IN_SETTINGS) {
                if (pattern.test(text)) {
                    violations.push(`${file.replace(root + "/", "")} → ${pattern}`);
                    break;
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it("configurationRuntime.css defines Alloy pine and stone border variables", () => {
        const css = readFileSync(join(root, "app/adminV2/settings/configurationRuntime.css"), "utf8");
        expect(css).toContain("--cr-pine");
        expect(css).toContain("--cr-stone-border");
        expect(css).toContain("background: white");
        expect(css).not.toContain("alloy-blue");
    });

    it("settings shell uses white canvas", () => {
        const providers = readFileSync(join(root, "app/adminV2/settings/AdminV2SettingsClientProviders.tsx"), "utf8");
        expect(providers).toContain("config-runtime-shell");
        expect(providers).toContain("bg-white");
        expect(providers).not.toContain("#EEF2F8");
    });

    it("layout editor widget style uses pine not blue", () => {
        const style = readFileSync(join(root, "lib/layout/layoutEditorWidgetStyle.ts"), "utf8");
        expect(style).toContain("alloy-pine");
        expect(style).not.toContain("alloy-blue");
    });
});
