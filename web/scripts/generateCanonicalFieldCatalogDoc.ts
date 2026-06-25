/**
 * Emit docs/canonical-field-catalog.md from source registries.
 *
 * Usage: cd web && npx tsx scripts/generateCanonicalFieldCatalogDoc.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    buildCanonicalFieldCatalogRows,
    formatCanonicalFieldCatalogMarkdown,
} from "@/lib/fields/buildCanonicalFieldCatalog";

const rows = buildCanonicalFieldCatalogRows();
const markdown = formatCanonicalFieldCatalogMarkdown(rows);
const outPath = resolve(__dirname, "../../docs/canonical-field-catalog.md");
writeFileSync(outPath, markdown, "utf8");
console.log(`Wrote ${rows.length} rows to ${outPath}`);
