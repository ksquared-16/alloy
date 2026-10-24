import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contained production builds deny outbound network. `next/font/google` fetches
 * at build time and fails offline. App layouts must use `next/font/local`
 * (`@/lib/fonts/poppins`) instead.
 */
const WEB_ROOT = join(__dirname, "..", "..");
const SCAN_ROOTS = ["app", "components", "lib", "hooks", "contexts"].map((d) => join(WEB_ROOT, d));
const SOURCE_RE = /\.(tsx?|jsx?)$/;
const FORBIDDEN = /from\s+["']next\/font\/google["']|require\(["']next\/font\/google["']\)/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "dist") continue;
      walk(p, out);
    } else if (SOURCE_RE.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("offline production-build fonts", () => {
  it("does not import next/font/google from application source", () => {
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        if (FORBIDDEN.test(text)) hits.push(relative(WEB_ROOT, file));
      }
    }
    expect(hits).toEqual([]);
  });

  it("vendors Poppins latin woff2 weights used by next/font/local", () => {
    const dir = join(WEB_ROOT, "fonts", "poppins");
    for (const weight of ["300", "400", "500", "600", "700"]) {
      const file = join(dir, `poppins-latin-${weight}-normal.woff2`);
      expect(statSync(file).isFile(), file).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(1000);
    }
    expect(statSync(join(dir, "OFL.txt")).isFile()).toBe(true);
  });
});
