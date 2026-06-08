#!/usr/bin/env npx tsx
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";
import { isActivationOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleActivationOwned";
import { lifecycleBuilderFromDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderConfig";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

const orgId = (process.env.DEV_QUEUE_ORG_ID ?? "93667019-bd28-49b5-a688-acc9bb1e0a19").trim();

async function main() {
    const supabase = createAdminClient();
    const { data } = await supabase.from("departments").select("id,name,key,is_active,metadata").eq("org_id", orgId);
    console.log("departments", (data ?? []).length);
    for (const d of data ?? []) {
        const meta = d.metadata as Record<string, unknown> | null;
        const act = lifecycleActivationFromMetadata(meta);
        const builder = lifecycleBuilderFromDepartmentMetadata(meta);
        const owned = isActivationOwnedDepartmentMetadata(meta);
        if (act || builder || owned) {
            console.log({
                id: d.id,
                name: d.name,
                key: d.key,
                is_active: d.is_active,
                owned_flag: owned,
                activation_owned: act?.activation_owned,
                process_id: act?.process_id,
                stage_key: act?.stage_key,
                work_unit_id: act?.work_unit_id,
                builder_processes: builder?.processes?.length ?? 0,
            });
        }
    }
}
main();
