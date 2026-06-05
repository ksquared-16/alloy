import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(WEB_ROOT, rel), "utf8");
}

describe("child drawer VM compose server safety", () => {
    const serverComposeChain = [
        "lib/adminV2/viewModel/drawer/child/composeChildDrawerViewModel.ts",
        "lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload.ts",
        "lib/admin/person/personDrawerChildLifecycleSlots.ts",
        "lib/admin/person/personDrawerChildPlacementContext.ts",
        "lib/admin/person/resolvePersonDrawerChildEnrollmentProgress.ts",
        "lib/admin/person/buildPersonEnrollmentActivityEntries.ts",
    ];

    it("does not import client-only PersonDrawerEnrollmentActivity in server compose chain", () => {
        for (const rel of serverComposeChain) {
            const src = read(rel);
            expect(src).not.toContain("PersonDrawerEnrollmentActivity");
            expect(src).not.toMatch(/^"use client"/m);
        }
    });

    it("buildPersonEnrollmentActivityEntries lives in server-safe lib module", () => {
        const lib = read("lib/admin/person/buildPersonEnrollmentActivityEntries.ts");
        expect(lib).toContain("export function buildPersonEnrollmentActivityEntries");
        expect(lib).not.toContain('"use client"');
        expect(read("lib/admin/person/personDrawerChildLifecycleSlots.ts")).toContain(
            "@/lib/admin/person/buildPersonEnrollmentActivityEntries"
        );
    });

    it("client component re-exports lib helper without duplicating logic", () => {
        const ui = read("components/admin/entity/PersonDrawerEnrollmentActivity.tsx");
        expect(ui).toContain('"use client"');
        expect(ui).toContain("@/lib/admin/person/buildPersonEnrollmentActivityEntries");
        expect(ui).not.toContain("export function buildPersonEnrollmentActivityEntries(");
    });
});
