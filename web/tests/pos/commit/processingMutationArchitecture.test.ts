import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COMMIT_ROOT = join(process.cwd(), "lib/pos/processingCase/commit");

function listTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
        else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
}

const FORBIDDEN = [
    "childrenCommitCapability",
    "writableProviders",
    "customer_members.first_name",
    "customer_members.last_name",
    "customer_members.dob",
    "ExistingChildWriteColumn",
    "columnFromTarget",
    "write_target",
    "buildNativeCustomerMemberUpdates",
    "partitionCustomerMemberPatchBody",
    "platformFieldCatalog",
    "customerMemberFieldRegistry",
];

describe("Processing commit mutation architecture", () => {
    it("Processing commit modules do not embed field ownership or storage maps", () => {
        const files = listTsFiles(COMMIT_ROOT);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const content = readFileSync(file, "utf8");
            for (const token of FORBIDDEN) {
                expect(content, `${file} must not reference ${token}`).not.toContain(token);
            }
        }
    });

    it("canonical mutation layer does not import Processing commit modules", () => {
        for (const rel of [
            "lib/fields/mutation/resolveMutationCapability.ts",
            "lib/admin/customerMemberPatch.ts",
        ]) {
            const content = readFileSync(join(process.cwd(), rel), "utf8");
            expect(content).not.toContain("processingCase/commit");
            expect(content).not.toContain("@/lib/pos/");
            expect(content).not.toContain("ProcessingCollection");
        }
    });
});
