import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = join(__dirname, "../../..");

const ROUTE_FILES = [
    "app/api/admin/ai/task-assist/proposals/route.ts",
    "app/api/admin/ai/task-assist/proposals/[id]/approve/route.ts",
    "app/api/admin/ai/task-assist/proposals/[id]/reject/route.ts",
    "app/api/admin/operational-tasks/route.ts",
    "app/api/admin/operational-tasks/[id]/route.ts",
    "app/api/admin/communication-scheduled-sends/route.ts",
    "app/api/admin/communication-scheduled-sends/[id]/route.ts",
    "app/api/admin/communication-scheduled-sends/process-due/route.ts",
];

describe("Task Assist V1.1 persistence routes — no communications send import", () => {
    it.each(ROUTE_FILES)("%s does not import executeCommunicationsSend", (rel) => {
        const abs = join(webRoot, rel);
        const src = readFileSync(abs, "utf8");
        expect(src).not.toContain("executeCommunicationsSend");
    });
});
