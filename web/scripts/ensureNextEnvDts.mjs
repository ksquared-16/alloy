#!/usr/bin/env node
/**
 * Ensure `web/next-env.d.ts` exists for typecheck without requiring a prior
 * `next build` / `next dev`.
 *
 * Next regenerates this file and flips the routes import between
 * `.next/types/routes.d.ts` and `.next/dev/types/routes.d.ts`. The file is
 * gitignored (generated-file contract) so regeneration does not dirty exact-
 * source identity. This helper only creates a missing stub; it never overwrites
 * a present file (so a just-regenerated Next output is left alone).
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(webRoot, "next-env.d.ts");

const STUB = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;

if (!existsSync(target)) {
  writeFileSync(target, STUB, "utf8");
  process.stderr.write("ensureNextEnvDts: wrote web/next-env.d.ts stub\n");
}
