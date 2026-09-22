/**
 * AUTHORING CANNOT SILENTLY RECREATE THE HAZARD.
 *
 * `none` means "intentionally not staffing". Before this slice it was also what you
 * got by saying nothing: both writers coalesced an omitted participation to `none`,
 * and the Studio form defaulted its control there. That is how `recurring_service` —
 * the type carrying every Staff assignment in staging — came to be `none` while the
 * runtime counted its work anyway.
 *
 * Once staffing reads the field, the same omission stops being cosmetic and starts
 * deleting supply. The update path is the sharper edge: renaming a category or
 * changing its icon would have reclassified it, and the operator's first clue would
 * be a roster quietly reading short.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

import {
    createOrgAssignmentType,
    updateOrgAssignmentType,
} from "@/lib/operationalAssignments/assignmentTypeService";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

let orgId = "";
const made: string[] = [];

/** The admin record types id as nullable; a freshly created row always has one. */
function idOf(t: { id: string | null }): string {
    if (!t.id) throw new Error("created assignment type has no id");
    return t.id;
}

async function participationOf(id: string): Promise<string> {
    const { data } = await db
        .from("operational_assignment_types")
        .select("staffing_participation").eq("id", id).single();
    return (data as { staffing_participation: string }).staffing_participation;
}

describe.runIf(LIVE)("assignment type authoring safety", () => {
    beforeEach(async () => {
        const { data } = await db.from("operational_assignment_types").select("org_id").limit(1).single();
        orgId = (data as { org_id: string }).org_id;
    });
    afterEach(async () => {
        for (const id of made.splice(0)) await db.from("operational_assignment_types").delete().eq("id", id);
    });

    it("creating a Staff-capable type REFUSES an omitted staffing choice", async () => {
        await expect(
            createOrgAssignmentType(db, orgId, {
                label: `qa auth ${randomUUID().slice(0, 6)}`,
                subjectTypes: ["staff"],
                // staffingParticipation deliberately omitted
            } as never)
        ).rejects.toThrow(/staffing choice cannot be left unset/i);
    });

    it("creating a Staff-capable type accepts an intentional none", async () => {
        const t = await createOrgAssignmentType(db, orgId, {
            label: `qa auth ${randomUUID().slice(0, 6)}`,
            subjectTypes: ["staff"],
            staffingParticipation: "none",
        } as never);
        made.push(idOf(t));
        expect(await participationOf(idOf(t))).toBe("none");
    });

    it("a child-only type is unaffected — its behaviour is preserved", async () => {
        const t = await createOrgAssignmentType(db, orgId, {
            label: `qa auth ${randomUUID().slice(0, 6)}`,
            subjectTypes: ["child"],
        } as never);
        made.push(idOf(t));
        expect(await participationOf(idOf(t))).toBe("none");
    });

    it("an unrelated edit does NOT reset participation to none", async () => {
        const t = await createOrgAssignmentType(db, orgId, {
            label: `qa auth ${randomUUID().slice(0, 6)}`,
            subjectTypes: ["staff"],
            staffingParticipation: "supply",
        } as never);
        made.push(idOf(t));
        expect(await participationOf(idOf(t))).toBe("supply");

        // Rename only. Participation is not mentioned.
        await updateOrgAssignmentType(db, orgId, idOf(t), {
            label: `qa renamed ${randomUUID().slice(0, 6)}`,
            subjectTypes: ["staff"],
        } as never);

        expect(await participationOf(idOf(t)), "a rename must not reclassify staffing").toBe("supply");
    });

    it("an explicit edit still changes participation", async () => {
        const t = await createOrgAssignmentType(db, orgId, {
            label: `qa auth ${randomUUID().slice(0, 6)}`,
            subjectTypes: ["staff"],
            staffingParticipation: "supply",
        } as never);
        made.push(idOf(t));
        await updateOrgAssignmentType(db, orgId, idOf(t), {
            label: "qa auth explicit",
            subjectTypes: ["staff"],
            staffingParticipation: "none",
        } as never);
        expect(await participationOf(idOf(t))).toBe("none");
    });
});
