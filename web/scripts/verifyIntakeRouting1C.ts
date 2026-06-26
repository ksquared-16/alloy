#!/usr/bin/env npx tsx
/**
 * Runtime Test 1C verification — exercises applyFormIntakeSafe with live link metadata.
 * Run from web/: npx tsx --tsconfig tsconfig.json scripts/verifyIntakeRouting1C.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { applyFormIntakeSafe } from "@/lib/forms/intake/applyFormIntakeSafe";
import type { FormPayload } from "@/lib/forms/validateSubmission";

import { CANONICAL_DEV_ORG_ID } from "@/lib/fields/canonicalDevOrg";
import {
    DEMO_CHILDCARE_CENTER_LOCATION_ID,
    DEMO_CHILDCARE_ENROLLMENT_DEPT_ID,
    DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID,
    DEMO_CHILDCARE_MED_LINK_ID,
    DEMO_CHILDCARE_VERTICAL_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG_ID = process.env.CANONICAL_VERIFY_ORG_ID?.trim() || CANONICAL_DEV_ORG_ID;
const LINK_ID = DEMO_CHILDCARE_MED_LINK_ID;
const VERTICAL_ID = DEMO_CHILDCARE_VERTICAL_ID;
const LOCATION_ID = DEMO_CHILDCARE_CENTER_LOCATION_ID;
const WORK_UNIT_ID = DEMO_CHILDCARE_ENROLLMENT_WORK_UNIT_ID;

async function main() {
    const supabase = createAdminClient();
    const { data: link, error: linkErr } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("id", LINK_ID)
        .maybeSingle();
    if (linkErr || !link?.metadata) throw new Error(linkErr?.message ?? "link not found");

    const linkMetadata = link.metadata as Record<string, unknown>;
    const stamp = Date.now();
    const email = `runtime1c.verify.${stamp}@example.com`;
    const submissionId = crypto.randomUUID();

    const payload: FormPayload = {
        values: {},
        meta: {
            intake: {
                vertical_id: VERTICAL_ID,
                idempotency_key: submissionId,
                guardian: {
                    email,
                    first_name: "Runtime1C",
                    last_name: "Verify",
                },
                child: {
                    first_name: "Test",
                    last_name: "Child",
                    dob: "2026-02-01",
                },
                opportunity: { name: "Runtime1C Verify" },
            },
        },
    };

    const result = await applyFormIntakeSafe(supabase, {
        orgId: ORG_ID,
        linkMetadata,
        defaultVerticalId: VERTICAL_ID,
        defaultOpportunityStatusKey: "new",
        payload,
    });

    if (!result.opportunity_id) {
        console.log(JSON.stringify({ error: "no opportunity_id", outcomeMeta: result.outcomeMeta }, null, 2));
        process.exit(1);
    }

    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, source, location_id, work_unit_id, status_key, vertical_id")
        .eq("id", result.opportunity_id)
        .maybeSingle();
    if (oppErr || !opp) throw new Error(oppErr?.message ?? "opportunity not found");

    console.log(
        JSON.stringify(
            {
                verification: "Runtime Test 1C applyFormIntakeSafe",
                testEmail: email,
                opportunityId: result.opportunity_id,
                intake_opportunity_match: result.outcomeMeta.intake_opportunity_match,
                source: opp.source,
                location_id: opp.location_id,
                work_unit_id: opp.work_unit_id,
                status_key: opp.status_key,
                vertical_id: opp.vertical_id,
                expected: {
                    source: "embed",
                    location_id: LOCATION_ID,
                    work_unit_id: WORK_UNIT_ID,
                    intake_opportunity_match: "created",
                },
                pass:
                    opp.source === "embed" &&
                    opp.location_id === LOCATION_ID &&
                    opp.work_unit_id === WORK_UNIT_ID &&
                    result.outcomeMeta.intake_opportunity_match === "created",
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
