import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
    findCanonicalCollectionProvider,
    listCanonicalCollectionProviders,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { providerContextRequirementsFromCanonicalRef } from "@/lib/fields/collection/providerContextRequirements";
import { buildCollectionIterationContext } from "@/lib/fields/collection/collectionIterationContext";
import { evaluateProviderAvailabilityForIteration } from "@/lib/fields/collection/evaluateProviderAvailabilityForIteration";

const FORBIDDEN = ["@/lib/forms/", "react", "@/components/", "FormSchema", "validateSubmission", "processingCase", "form_submissions"];

function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
        else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
    }
    return out;
}

describe("canonical collection platform architecture", () => {
    it("canonical collection modules do not import Forms, Processing UI, or React", () => {
        const root = join(process.cwd(), "lib/fields/collection");
        for (const file of listTsFiles(root)) {
            const content = readFileSync(file, "utf8");
            for (const pattern of FORBIDDEN) {
                expect(content, `${file} must not reference ${pattern}`).not.toContain(pattern);
            }
        }
    });

    it("registry defines Children and Parents without Forms types", () => {
        expect(findCanonicalCollectionProvider("children")?.itemEntityType).toBe("customer_member");
        expect(findCanonicalCollectionProvider("person.contact_role.parents")?.itemEntityType).toBe("person");
        expect(listCanonicalCollectionProviders().length).toBeGreaterThanOrEqual(2);
    });

    it("context availability works without Forms payload", () => {
        const ctx = buildCollectionIterationContext({ collectionProviderRef: "children", itemEntityType: "customer_member" });
        const result = evaluateProviderAvailabilityForIteration({
            requirements: providerContextRequirementsFromCanonicalRef({ entity_type: "customer_member", field_key: "first_name" }),
            iterationContext: ctx,
        });
        expect(result.available).toBe(true);
    });
});
