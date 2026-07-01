import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    buildCanonicalWorkUnitOperationalBootstrapUrl,
    workUnitBootstrapOwnershipKey,
} from "@/lib/adminV2/workUnitBootstrapClientSession";
import { parseWorkUnitBootstrapOwnershipFromHref } from "@/lib/adminV2/workUnitBootstrapPrefetchFromDept";
import {
    resolveAuthoritativeWorkUnitQueueKey,
    workUnitBootstrapOwnershipFromSelection,
    workUnitQueueSelectionFromLocation,
} from "@/lib/adminV2/workUnitQueueSelection";
import { workspaceDeptQueueNavHref } from "@/lib/adminV2/navigation/buildWorkspaceNavDeptChildren";
import { CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 } from "@/lib/config/enrollmentPipelineQueueDefinitionV1";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("work-unit queue route authority (dept → WU)", () => {
    it("dept oper href includes queue key for pipeline lanes", () => {
        const href = workspaceDeptQueueNavHref(
            "/adminV2/workspace",
            "dept-1",
            "wu-enroll",
            "enrolled"
        );
        expect(href).toContain("?queue=enrolled");
    });

    it("parses queue from dept oper href into bootstrap ownership", () => {
        const parsed = parseWorkUnitBootstrapOwnershipFromHref(
            "/adminV2/workspace/dept/dept-1/work-unit/wu-1?queue=tour_scheduled",
            "dept-1",
            null
        );
        expect(parsed).toEqual({
            departmentId: "dept-1",
            workUnitId: "wu-1",
            selectedSiteId: null,
            focusQueue: "tour_scheduled",
            attentionBucket: null,
        });
    });

    it("bootstrap URL and ownership key include explicit focus queue", () => {
        const selection = workUnitQueueSelectionFromLocation("wu-1", {
            queue: "enrolled",
            unmapped: false,
            attentionBucket: "",
            statusKeys: "",
            attentionReason: "",
            attentionReasonCode: "",
            activitySignalKey: "",
        });
        const ownership = workUnitBootstrapOwnershipFromSelection("dept-1", "site-1", selection);
        const url = buildCanonicalWorkUnitOperationalBootstrapUrl(ownership);
        expect(url).toContain("focus_queue=enrolled");
        expect(workUnitBootstrapOwnershipKey(ownership)).toBe("dept-1|wu-1|site-1|enrolled|");
    });

    it("explicit URL queue beats default primary when summaries list first lane", () => {
        const wu = { queue_definition: CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1 };
        const summaries = CANONICAL_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V1.queues.map((q) => ({ key: q.key }));
        const primary = resolveAuthoritativeWorkUnitQueueKey(wu, summaries, "enrolled");
        expect(primary).toBe("enrolled");
        expect(primary).not.toBe("contact_attempted");
    });

    it("WU page passes route queue into bootstrap session ownership", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("workUnitBootstrapOwnershipFromSelection");
        expect(page).toContain("routeQueueSelectionRef");
        expect(page).toContain("authoritativePrimary");
        expect(page).toContain("plMatchesAuthoritative");
        expect(page).toContain("opportunityDrawerNavigatorMatchesWorkUnitSelection");
        expect(page).toContain("hydrateDeferredQueueSummaryCounts");
        expect(page).toContain("mergeWorkUnitQueueSummaryCounts");
    });

    it("dept throughput cards use workspaceDeptQueueNavHref with lane key", () => {
        const dept = read("app/adminV2/workspace/dept/[departmentId]/page.tsx");
        expect(dept).toContain("workspaceDeptQueueNavHref");
        expect(dept).toMatch(/lanes\.map\([\s\S]*?lane\.key/);
    });
});
