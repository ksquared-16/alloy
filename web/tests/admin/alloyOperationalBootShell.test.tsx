import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("AlloyOperationalBootShell — first-load branded shell", () => {
    it("renders workspace-v2 shell markers and branded loader (no generic Loading text)", () => {
        const html = renderToStaticMarkup(<AlloyOperationalBootShell variant="workspace" />);
        expect(html).toContain('data-adminv2-app-shell="workspace-v2"');
        expect(html).toContain('data-alloy-operational-boot-shell="true"');
        expect(html).toContain("Preparing workspace");
        expect(html).not.toMatch(/>Loading…</);
        expect(html).not.toContain("Loading context");
    });

    it("AdminV2Shell Suspense fallback uses AlloyOperationalBootShell", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("AlloyOperationalBootShell");
        expect(shell).not.toMatch(/Suspense fallback=\{<div[^>]*>Loading…/);
    });

    it("adminV2 loading.tsx streams the branded boot shell", () => {
        const loading = read("app/adminV2/loading.tsx");
        expect(loading).toContain("AlloyOperationalBootShell");
    });

    it("workspace layout org bootstrap uses boot shell instead of Loading context", () => {
        const layout = read("app/adminV2/workspace/layout.tsx");
        expect(layout).toContain("AlloyOperationalBootShell");
        expect(layout).not.toContain("Loading context");
    });
});
