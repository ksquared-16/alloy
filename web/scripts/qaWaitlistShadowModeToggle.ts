#!/usr/bin/env npx tsx
/**
 * Toggle waitlist shadow mode on the pilot enrollment work unit only (Card 4).
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npm run qa:waitlist:shadow-mode -- true
 *   ORG_ID=<uuid> npm run qa:waitlist:shadow-mode -- false
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { parsePlacementPriorityLayer } from "@/lib/orchestration/placement/placementConfigSchema";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const PILOT_ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const ALLOWED_WORK_UNIT_KEYS = new Set(["enrollment_pipeline"]);

function parseShadowArg(raw: string | undefined): boolean | null {
    const t = raw?.trim().toLowerCase();
    if (t === "true" || t === "1" || t === "on") return true;
    if (t === "false" || t === "0" || t === "off") return false;
    return null;
}

async function main() {
    const orgId = (process.env.ORG_ID ?? PILOT_ORG).trim();
    const workUnitKey = process.env.WORK_UNIT_KEY?.trim() || "enrollment_pipeline";
    const shadowMode = parseShadowArg(process.argv[2]);

    if (shadowMode == null) {
        console.error(
            JSON.stringify(
                {
                    ok: false,
                    error: "Usage: npm run qa:waitlist:shadow-mode -- true|false",
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    if (!ALLOWED_WORK_UNIT_KEYS.has(workUnitKey)) {
        console.error(
            JSON.stringify(
                {
                    ok: false,
                    error: `Refusing to toggle shadow mode on work unit key "${workUnitKey}" — pilot keys only: ${[...ALLOWED_WORK_UNIT_KEYS].join(", ")}`,
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, key, name, metadata")
        .eq("org_id", orgId)
        .eq("key", workUnitKey)
        .maybeSingle();
    if (wuErr) throw new Error(wuErr.message);
    if (!wu?.id) {
        console.error(JSON.stringify({ ok: false, error: `work unit ${workUnitKey} not found` }, null, 2));
        process.exit(1);
    }

    const base =
        wu.metadata != null && typeof wu.metadata === "object" && !Array.isArray(wu.metadata)
            ? { ...(wu.metadata as Record<string, unknown>) }
            : {};
    const prevLayer = parsePlacementPriorityLayer(base);
    if (!prevLayer?.enabled) {
        console.error(
            JSON.stringify(
                {
                    ok: false,
                    error: "placement_priority_v1 is not enabled on this work unit — enable via settings first",
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    const nextLayer = { ...prevLayer, shadow_mode: shadowMode };
    const nextMetadata = { ...base, placement_priority_v1: nextLayer };

    const { error: updateErr } = await supabase
        .from("work_units")
        .update({ metadata: nextMetadata })
        .eq("org_id", orgId)
        .eq("id", wu.id);
    if (updateErr) throw new Error(updateErr.message);

    console.log(
        JSON.stringify(
            {
                ok: true,
                org_id: orgId,
                work_unit_id: wu.id,
                work_unit_key: workUnitKey,
                shadow_mode: shadowMode,
                ui_lane_cue: shadowMode ? "Priority preview" : "Ordered by priority",
                placement_priority_v1: nextLayer,
            },
            null,
            2
        )
    );
}

void main();
