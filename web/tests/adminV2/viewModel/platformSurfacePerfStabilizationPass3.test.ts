import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workUnitPageContentReady } from "@/lib/adminV2/workUnitPageRevealPolicy";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

const webRoot = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}
