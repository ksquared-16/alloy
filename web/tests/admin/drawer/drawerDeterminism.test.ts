/**
 * Determinism regression tests for queue pill switching and drawer payload ownership.
 *
 * These tests verify that:
 * - Stale async responses never overwrite current UI state
 * - Incomplete seeds never overwrite complete composed payloads
 * - Same person id opened under different layouts gets independent fetch sentinels
 * - Queue lane errors allow recovery on retry
 * - Opportunity primary alone cannot satisfy composed ready when full record is required
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
    evaluateComposedOpportunityDrawerPayload,
    evaluateComposedPersonDrawerPayload,
} from "@/lib/admin/drawer/composedDrawerPayload";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import {
    buildOpportunityFamilyContactRows,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    isComposedPersonPayloadRecentlyReady,
    putComposedPersonPayloadReady,
    __clearComposedPersonPayloadCacheForTests,
} from "@/lib/admin/composedPersonPayloadCache";
import {
    putQueueRowCache,
    queueRowLogicalCacheKey,
    touchQueueRowCacheOnHit,
} from "@/lib/workspace/queueRowClientCache";
import {
    peekDrawerEntitySnapshot,
    putDrawerEntitySnapshot,
    __clearDrawerEntitySnapshotCacheForTests,
} from "@/lib/admin/drawerEntitySnapshotCache";
import {
    resetOpportunityDrawerHydrateGuards,
    tryBeginOpportunityDrawerHydrate,
    finishOpportunityDrawerHydrate,
} from "@/lib/admin/opportunityDrawerHydrateGuards";

const FP = "scope:test";
const WU = "wu-det-1";

const webRoot = join(__dirname, "..", "..", "..");
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

// ─── Queue No-records guard ────────────────────────────────────────────────────
