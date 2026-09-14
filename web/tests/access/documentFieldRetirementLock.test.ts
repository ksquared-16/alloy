import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const webRoot = join(__dirname, "..", "..");

/**
 * DOCUMENT FIELD DEFINITIONS IS RETIRED, AND MUST NOT COME BACK BY ACCIDENT.
 *
 * The subsystem was a per-doc_type extraction schema with an authoring screen. The deployed census
 * found ZERO definitions and ZERO captured values — ever — on a tenant carrying 180 documents and 424
 * canonical field definitions, and no runtime read anywhere outside its own two routes. So it was
 * deleted rather than given a capability: handing live authority to a surface nobody uses is how a
 * dead product acquires a reason to exist.
 *
 * This lock is deliberately small. It proves ABSENCE of the product — routes, page, client, registry
 * entry, navigation — and nothing else. The tables survive on purpose and are NOT asserted here; see
 * document-field-table-schema-hygiene-debt.md.
 */
describe("Document Field Definitions stays retired", () => {
    it("no API route serves the subsystem", () => {
        expect(existsSync(join(webRoot, "app", "api", "admin", "document-field-definitions"))).toBe(false);
    });

    it("no mounted product surface remains, in either shell", () => {
        expect(existsSync(join(webRoot, "app", "adminV2", "settings", "documents", "document-fields"))).toBe(false);
        expect(existsSync(join(webRoot, "app", "legacy-admin", "system", "document-fields"))).toBe(false);
    });

    it("no configuration registry entry or navigation link points at it", () => {
        const domains = readFileSync(join(webRoot, "lib", "adminV2", "configurationWorkspaceDomains.ts"), "utf8");
        expect(domains).not.toContain("documents/document-fields");
        expect(domains).not.toMatch(/label:\s*"Document fields"/);

        const adminLayout = readFileSync(join(webRoot, "components", "admin", "AdminLayout.tsx"), "utf8");
        expect(adminLayout).not.toContain("documents/document-fields");
    });

    it("the route-capability inventory carries no declaration for it", () => {
        const inventory = readFileSync(join(webRoot, "scripts", "routeCapabilities.declared.json"), "utf8");
        expect(inventory).not.toContain("document-field-definitions");
    });

    it("the lock is not vacuous — the surviving neighbours it was scoped against are still there", () => {
        // If the Documents settings area or the canonical field system vanished, every assertion above
        // would pass for the wrong reason.
        expect(existsSync(join(webRoot, "lib", "adminV2", "configurationWorkspaceDomains.ts"))).toBe(true);
        expect(existsSync(join(webRoot, "app", "api", "admin", "field-definitions"))).toBe(true);
    });
});
