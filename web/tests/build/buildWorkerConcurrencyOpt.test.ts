/**
 * OPT-1 — experimental.cpus: 4 on the build-memory-opt branch.
 * Source-level guard: worker cap present; TypeScript skip policy unchanged.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nextConfigPath = resolve(process.cwd(), "next.config.ts");

describe("build worker concurrency OPT-1", () => {
  const src = readFileSync(nextConfigPath, "utf8");

  it("caps experimental.cpus at 4 for static page-data / prerender workers", () => {
    expect(src).toMatch(/experimental:\s*\{[\s\S]*?cpus:\s*4/);
  });

  it("does not enable memoryBasedWorkersCount (OPT-2 held)", () => {
    expect(src).not.toMatch(/memoryBasedWorkersCount:\s*true/);
  });

  it("keeps in-build typecheck skip gated on SKIP_BUILD_TYPECHECK===\"1\" only", () => {
    expect(src).toContain('ignoreBuildErrors: process.env.SKIP_BUILD_TYPECHECK === "1"');
  });
});
