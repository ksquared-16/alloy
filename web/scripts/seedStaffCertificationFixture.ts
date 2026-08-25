#!/usr/bin/env npx tsx
/**
 * STAFF CARD CERTIFICATION FIXTURE — additive, namespaced, idempotent, removable.
 *
 * The certification tenant contains zero staff, so the person-grain Staff card cannot be certified
 * against anything. This creates the smallest set of specimens that exercises it, through the
 * CANONICAL path only: `addStaff` writes `persons` + `employments` with identity resolution, exactly
 * as the registered `staff.add` capability does. Nothing here writes a table that product code does
 * not already own, and no fixture-only column is invented.
 *
 * ── WHY A NAMESPACE AND NOT "just add some staff" ──
 *
 * The local Supabase stack is SHARED between sessions. An unnamespaced fixture cannot be told apart
 * from a colleague's data, so it can neither be re-run safely nor removed safely. Every record here
 * is identified by a reserved email domain, and removal matches on exactly that — never on a name,
 * never on "staff created recently".
 *
 * Run from `web/`:
 *   npx tsx scripts/seedStaffCertificationFixture.ts            # create/verify
 *   npx tsx scripts/seedStaffCertificationFixture.ts --remove   # delete ONLY namespaced records
 *   ALLOY_CERT_ORG_ID=<uuid> npx tsx scripts/seedStaffCertificationFixture.ts
 *
 * Specimen ids are documented in the certification doc, deliberately not in product code.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { addStaff } from "@/lib/staff/addStaffService";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

/** The reserved namespace. `.invalid` is RFC-2606 reserved, so it can never collide with a real address. */
const CERT_EMAIL_DOMAIN = "staff-cert.alloy.invalid";
const CERT_MARKER = "ALLOY_STAFF_CERT_V1";

type Specimen = {
    slug: string;
    firstName: string;
    lastName: string;
    /** What this specimen exists to prove. */
    proves: string;
    startDateOffsetDays: number;
    endDateOffsetDays?: number;
    employmentType?: string;
    withPosition: boolean;
    withLocation: boolean;
};

/**
 * The smallest set that exercises the card. Each specimen earns its place by proving something the
 * others cannot; there is no "one more for good measure".
 */
const SPECIMENS: readonly Specimen[] = [
    {
        slug: "active-located",
        firstName: "Certified",
        lastName: "Active-Located",
        proves: "active employment with position + primary location; the full insight sentence",
        startDateOffsetDays: -400,
        employmentType: "full_time",
        withPosition: true,
        withLocation: true,
    },
    {
        slug: "active-bare",
        firstName: "Certified",
        lastName: "Active-Bare",
        proves: "active employment with NO position and NO location — optional facts must be absent, not blank placeholders",
        startDateOffsetDays: -30,
        employmentType: "part_time",
        withPosition: false,
        withLocation: false,
    },
    {
        slug: "starting-soon",
        firstName: "Certified",
        lastName: "Starting-Soon",
        proves: "the canonical `pending_start` state and its 'Starts <date>' label",
        startDateOffsetDays: 21,
        employmentType: "full_time",
        withPosition: true,
        withLocation: true,
    },
    {
        slug: "ended",
        firstName: "Certified",
        lastName: "Ended",
        proves: "the canonical `ended` state — the card must say 'Formerly …', never imply current employment",
        startDateOffsetDays: -800,
        endDateOffsetDays: -60,
        employmentType: "temporary",
        withPosition: true,
        withLocation: false,
    },
];

function ymd(offsetDays: number, today: Date): string {
    const d = new Date(today.getTime());
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

function emailFor(slug: string): string {
    return `staff.${slug}@${CERT_EMAIL_DOMAIN}`;
}

async function resolveOrgId(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
    const explicit = process.env.ALLOY_CERT_ORG_ID?.trim();
    if (explicit) return explicit;
    const { data, error } = await supabase.from("orgs").select("id, name").order("created_at").limit(2);
    if (error) throw new Error(`orgs lookup failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error("no orgs in this database");
    if (data.length > 1) {
        throw new Error(
            "more than one org present — pass ALLOY_CERT_ORG_ID explicitly rather than guessing which tenant to seed",
        );
    }
    return data[0]!.id as string;
}

async function remove(supabase: ReturnType<typeof createAdminClient>, orgId: string): Promise<void> {
    const emails = SPECIMENS.map((s) => emailFor(s.slug));
    const { data: people, error } = await supabase
        .from("persons")
        .select("id, email")
        .eq("org_id", orgId)
        .in("email", emails);
    if (error) throw new Error(`persons lookup failed: ${error.message}`);
    const ids = (people ?? []).map((p) => p.id as string);
    if (ids.length === 0) {
        console.log("nothing to remove — no namespaced records present");
        return;
    }
    // Employment first: it references the person.
    const { error: empErr } = await supabase.from("employments").delete().eq("org_id", orgId).in("person_id", ids);
    if (empErr) throw new Error(`employments delete failed: ${empErr.message}`);
    const { error: perErr } = await supabase.from("persons").delete().eq("org_id", orgId).in("id", ids);
    if (perErr) throw new Error(`persons delete failed: ${perErr.message}`);
    console.log(`removed ${ids.length} namespaced person(s) and their employment rows`);
}

async function main(): Promise<void> {
    const supabase = createAdminClient();
    const orgId = await resolveOrgId(supabase);
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);

    if (process.argv.includes("--remove")) {
        await remove(supabase, orgId);
        return;
    }

    // Optional canonical references. Absent is fine — the specimens that ask for them simply prove
    // the "present" case only when the tenant actually configures them, and never invent an id.
    const { data: positions } = await supabase
        .from("employment_positions")
        .select("id, label")
        .eq("org_id", orgId)
        .limit(1);
    const { data: locations } = await supabase
        .from("locations")
        .select("id, name")
        .eq("org_id", orgId)
        .limit(1);
    const positionId = positions?.[0]?.id ?? null;
    const locationId = locations?.[0]?.id ?? null;
    if (!positionId) console.warn("! no employment_positions configured — position facts will be absent");
    if (!locationId) console.warn("! no locations configured — location facts will be absent");

    for (const spec of SPECIMENS) {
        const email = emailFor(spec.slug);
        const { data: existing, error: exErr } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("email", email)
            .maybeSingle();
        if (exErr) throw new Error(`persons lookup failed: ${exErr.message}`);
        if (existing?.id) {
            console.log(`= ${spec.slug.padEnd(16)} already present  person=${existing.id}`);
            continue;
        }

        const result = await addStaff(supabase, {
            orgId,
            firstName: spec.firstName,
            lastName: spec.lastName,
            email,
            // The namespace is the identity, so creation is unambiguous and needs no operator choice.
            createNewPerson: true,
            createNewReason: CERT_MARKER,
            startDate: ymd(spec.startDateOffsetDays, today),
            endDate: spec.endDateOffsetDays != null ? ymd(spec.endDateOffsetDays, today) : null,
            employmentType: spec.employmentType ?? null,
            positionId: spec.withPosition ? positionId : null,
            primaryLocationId: spec.withLocation ? locationId : null,
            todayYmd,
        } as Parameters<typeof addStaff>[1]);

        console.log(
            `+ ${spec.slug.padEnd(16)} person=${result.personId} employment=${result.employment.id} (${result.identityOutcome})`,
        );
    }

    console.log("\nspecimens:");
    for (const s of SPECIMENS) console.log(`  ${s.slug.padEnd(16)} — ${s.proves}`);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
});
