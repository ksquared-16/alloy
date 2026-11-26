import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpportunityDrawerPipelineState } from "@/lib/adminV2/drawerPipeline";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline";
import {
    opportunityDrawerAboveFoldGeometryChanged,
    snapshotOpportunityDrawerAboveFoldGeometry,
} from "@/lib/admin/drawer/opportunityDrawerAboveFoldGeometry";
import {
    buildOpportunityDrawerOpenerHintParams,
    readOpportunityDrawerOpenerHints,
} from "@/lib/admin/opportunityDrawerOpenerHints";
import {
    tryBeginOpportunityDrawerHydrate,
    finishOpportunityDrawerHydrate,
} from "@/lib/admin/opportunityDrawerHydrateGuards";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}
