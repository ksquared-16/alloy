/**
 * next/font/local under Turbopack requires `src` entries as written literals.
 * A shared array / `.filter()` fails production `next build` (Turbopack default on Next 16).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const poppinsPath = resolve(process.cwd(), "lib/fonts/poppins.ts");

describe("poppins next/font/local literals", () => {
  const src = readFileSync(poppinsPath, "utf8");

  it("inlines literal src arrays for poppins and poppinsAdminV2 (no shared variable / filter)", () => {
    expect(src).not.toMatch(/const\s+poppinsSrc\s*=/);
    // Runtime .filter on font src (Turbopack-illegal); ignore prose mentioning ".filter()".
    expect(src).not.toMatch(/\.filter\s*\(\s*\(/);
    expect(src).toMatch(/export const poppins = localFont\(\{[\s\S]*?src:\s*\[/);
    expect(src).toMatch(/export const poppinsAdminV2 = localFont\(\{[\s\S]*?src:\s*\[/);
  });

  it("keeps offline woff2 paths under web/fonts/poppins", () => {
    expect(src).toContain("../../fonts/poppins/poppins-latin-400-normal.woff2");
    expect(src).toContain("../../fonts/poppins/poppins-latin-700-normal.woff2");
    expect(src).toContain('variable: "--font-poppins"');
    expect(src).toContain('variable: "--font-poppins-adminv2"');
  });

  it("adminv2 omits weight 300 while root includes it", () => {
    const rootBlock = src.slice(src.indexOf("export const poppins ="), src.indexOf("export const poppinsAdminV2"));
    const adminBlock = src.slice(src.indexOf("export const poppinsAdminV2"));
    expect(rootBlock).toContain('weight: "300"');
    expect(adminBlock).not.toContain('weight: "300"');
  });
});
