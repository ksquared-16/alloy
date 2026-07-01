/**
 * Layout V2 proof — isolated, READ-ONLY waitlist candidate query (Phase 1).
 *
 *   GET /api/admin/layout-proof/waitlist-candidates
 *
 * Returns real `placement_candidates` for the org, mapped to the presentation
 * {@link WaitlistCandidateCardVM}, so the Layout V2 proof can compose the
 * candidate card face. It does NOT run the ranking engine: tier/position are
 * left to the runtime (blank here) — the proof renders, it never ranks. Cohort
 * label uses the existing pure normalizer. No writes; flag-gated (404 when off).
 *
 * Isolation: not used by any live queue; imports no live QueueBlock/VM pipeline;
 * only the pure cohort-label helper is reused.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2PreviewEnabledServer } from "@/lib/layout/featureFlag";
import { normalizePlacementWaitlistCohort } from "@/lib/orchestration/placement/normalizePlacementWaitlistCohort";
import type { WaitlistCandidateCardVM } from "@/lib/layout/waitlist/waitlistCandidateCardVm";

const MAX = 50;

type CandRow = {
    id: string;
    opportunity_id: string;
    customer_id: string | null;
    person_id: string | null;
    site_id: string | null;
    is_synthetic_fallback: boolean | null;
    program_room_cohort_key: string;
    program_room_group_label: string | null;
    wait_since: string | null;
    desired_start_date: string | null;
    status: string | null;
};

function formatDateLabel(iso: string | null): string | undefined {
    if (!iso) return undefined;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ageLabel(dob: string | null): string | undefined {
    if (!dob) return undefined;
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return undefined;
    const now = new Date("2026-06-06"); // proof reference date; runtime uses real now
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years -= 1;
    if (years >= 2) return `${years}y`;
    const months = Math.max(0, years * 12 + m);
    return `${months}mo`;
}

export async function GET() {
    if (!isLayoutV2PreviewEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }
    const supabase = createAdminClient();

    try {
        const { data: candData, error: candErr } = await supabase
            .from("placement_candidates")
            .select("id, opportunity_id, customer_id, person_id, site_id, is_synthetic_fallback, program_room_cohort_key, program_room_group_label, wait_since, desired_start_date, status")
            .eq("org_id", ctx.orgId)
            .in("status", ["active", "paused"])
            .limit(MAX);
        if (candErr) throw new Error(candErr.message);
        const candidates = (candData ?? []) as CandRow[];

        const personIds = [...new Set(candidates.map((c) => c.person_id).filter(Boolean))] as string[];
        const customerIds = [...new Set(candidates.map((c) => c.customer_id).filter(Boolean))] as string[];
        const siteIds = [...new Set(candidates.map((c) => c.site_id).filter(Boolean))] as string[];
        const candidateIds = candidates.map((c) => c.id);

        // --- child persons
        const childById = new Map<string, { first_name: string | null; last_name: string | null; date_of_birth: string | null }>();
        if (personIds.length) {
            const { data } = await supabase.from("persons").select("id, first_name, last_name, date_of_birth").in("id", personIds);
            for (const p of data ?? []) {
                const row = p as { id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null };
                childById.set(row.id, { first_name: row.first_name, last_name: row.last_name, date_of_birth: row.date_of_birth });
            }
        }
        // --- household names
        const customerName = new Map<string, string>();
        if (customerIds.length) {
            const { data } = await supabase.from("customers").select("id, name").in("id", customerIds);
            for (const c of data ?? []) customerName.set((c as { id: string }).id, String((c as { name?: string }).name ?? ""));
        }
        // --- primary contact per household
        const contactByCustomer = new Map<string, { name: string; phone: string | null; email: string | null }>();
        if (customerIds.length) {
            const { data } = await supabase.from("contacts").select("customer_id, first_name, last_name, phone, email").in("customer_id", customerIds).limit(500);
            for (const c of data ?? []) {
                const row = c as { customer_id: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
                if (row.customer_id && !contactByCustomer.has(row.customer_id)) {
                    contactByCustomer.set(row.customer_id, {
                        name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
                        phone: row.phone,
                        email: row.email,
                    });
                }
            }
        }
        // --- location labels
        const locationName = new Map<string, string>();
        if (siteIds.length) {
            const { data } = await supabase.from("locations").select("id, label, city").in("id", siteIds);
            for (const l of data ?? []) {
                const row = l as { id: string; label?: string | null; city?: string | null };
                locationName.set(row.id, (row.label?.trim() || row.city?.trim() || "") as string);
            }
        }
        // --- active overrides per candidate
        const overridesByCandidate = new Map<string, { kinds: string[]; reason: string | null }>();
        if (candidateIds.length) {
            const { data } = await supabase
                .from("placement_overrides")
                .select("placement_candidate_id, override_kind, reason, is_active")
                .in("placement_candidate_id", candidateIds)
                .eq("is_active", true);
            for (const o of data ?? []) {
                const row = o as { placement_candidate_id: string; override_kind: string; reason: string | null };
                const prev = overridesByCandidate.get(row.placement_candidate_id) ?? { kinds: [], reason: null };
                prev.kinds.push(row.override_kind);
                prev.reason = prev.reason ?? row.reason;
                overridesByCandidate.set(row.placement_candidate_id, prev);
            }
        }

        const cards: WaitlistCandidateCardVM[] = candidates.map((c) => {
            const child = c.person_id ? childById.get(c.person_id) : undefined;
            const childName = [child?.first_name, child?.last_name].filter(Boolean).join(" ").trim();
            const { cohortKey, cohortLabel } = normalizePlacementWaitlistCohort(c.program_room_cohort_key, c.program_room_group_label);
            const ov = overridesByCandidate.get(c.id);
            const kinds = ov?.kinds ?? [];
            const contact = c.customer_id ? contactByCustomer.get(c.customer_id) : undefined;
            const age = ageLabel(child?.date_of_birth ?? null);

            return {
                candidateId: c.id,
                opportunityId: c.opportunity_id,
                householdId: c.customer_id ?? undefined,
                childId: c.person_id ?? undefined,
                isSyntheticFallback: Boolean(c.is_synthetic_fallback),
                child: {
                    name: childName ? (age ? `${childName} (${age})` : childName) : "Child (no name on file)",
                    ageLabel: age,
                    birthdate: child?.date_of_birth ?? undefined,
                    programLabel: cohortLabel,
                    desiredStartDate: formatDateLabel(c.desired_start_date),
                },
                household: {
                    name: (c.customer_id ? customerName.get(c.customer_id) : undefined) || undefined,
                    primaryContactName: contact?.name || undefined,
                    phone: contact?.phone || undefined,
                    email: contact?.email || undefined,
                    locationName: (c.site_id ? locationName.get(c.site_id) : undefined) || undefined,
                },
                waitlist: {
                    cohortKey,
                    cohortLabel,
                    cohortSectionTitle: cohortLabel ? `${cohortLabel} waitlist` : undefined,
                    // tier/position are RUNTIME-COMPUTED — intentionally omitted in the proof.
                    tierLabel: undefined,
                    positionLabel: undefined,
                    waitSince: formatDateLabel(c.wait_since),
                    desiredStartDate: formatDateLabel(c.desired_start_date),
                    status: c.status ?? undefined,
                    shadowMode: false,
                },
                overrides: {
                    hasActive: kinds.length > 0,
                    kinds,
                    pinned: kinds.includes("pin"),
                    tierBoost: kinds.includes("tier_boost"),
                    temporary: kinds.includes("temporary"),
                    manuallyAdjusted: kinds.includes("pin"),
                    reason: ov?.reason ?? undefined,
                },
                actions: { canOpen: true, canMessage: true, canCreateOffer: true, canOverride: true, canAdjustPosition: true, canAskBos: true },
                widgets: {},
            };
        });

        return NextResponse.json({ entityType: "placement_candidate", count: cards.length, candidates: cards });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
