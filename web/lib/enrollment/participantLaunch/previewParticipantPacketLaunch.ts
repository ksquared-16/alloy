/**
 * WHAT SENDING THE PAPERWORK WOULD ACTUALLY DO — read, and shown before it happens.
 *
 * Launching is irreversible from the family's point of view: they receive it. So the operator gets
 * to see which child, which guardian, which requirements and whether a packet is already open,
 * before anything is sent. That is the whole purpose of this module, and it writes nothing.
 *
 * ── WHY IT REUSES THE LAUNCH'S OWN PLANNER ──
 *
 * The requirement list comes from `planRequirementDerivedPacket`, the same pure function
 * `launchParticipantEnrollment` plans with, over the same governing revision. A preview that
 * re-derived the set would eventually disagree with the launch, and the operator would be
 * confirming something other than what happens — the worst possible failure for a confirmation
 * step. Here the preview cannot drift, because there is one planner.
 *
 * ── WHAT IT REFUSES TO SHOW ──
 *
 * A fee AMOUNT. The financial requirement references a charge definition, Financials owns what it
 * costs, and the obligation does not exist until the fee is due. Printing a number from
 * configuration would be Enrollment quoting money it does not own — so the preview names the fee and
 * says plainly that the amount comes from Financials when it becomes due.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { resolveProcessInstanceConfiguration } from "@/lib/process/resolveProcessInstanceConfiguration";
import { resolveEffectiveStageKey } from "@/lib/lifecycle/processEntryStage";
import { entryIntentFromProcessInstanceMetadata } from "@/lib/lifecycle/processEntryPointsV1";
import { activeLifecycleProcess } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { canonicalStageRequirements } from "@/lib/lifecycle/effectiveStageRequirements";
import { planRequirementDerivedPacket } from "@/lib/enrollment/participantLaunch/requirementDerivedPacket";
import { resolveCurrentEnrollmentSession } from "@/lib/pos/packet/enrollmentObjectiveSession";

/** One thing the family will be asked for, in the operator's words. */
export type PreviewRequirement = {
    readonly position: number;
    readonly kind: "form" | "financial";
    /** The operator-facing name. Never an id. */
    readonly label: string;
    /** What this requirement is, said plainly. */
    readonly detail: string;
    /** For a Form: the published version a session will pin. Absent means nothing is published. */
    readonly publishedVersionLabel?: string;
};

export type PacketLaunchPreview = {
    readonly child: { readonly customerMemberId: string; readonly name: string };
    readonly householdName: string | null;
    readonly locationName: string | null;
    readonly recipientName: string | null;
    readonly governing: {
        readonly stageKey: string;
        readonly businessProcessRevisionId: string | null;
    };
    readonly requirements: readonly PreviewRequirement[];
    /** An open packet for this journey, when one already exists. Surfaced, never silently reused. */
    readonly existing: {
        readonly sessionId: string;
        readonly status: string | null;
        readonly participantPath: string | null;
    } | null;
    /** What pressing confirm will do, in one sentence. */
    readonly outcomeSentence: string;
    /** Present when the launch cannot proceed; the surface must not offer confirm. */
    readonly blocker: string | null;
};

export type PacketLaunchPreviewResult =
    | { readonly ok: true; readonly value: PacketLaunchPreview }
    | { readonly ok: false; readonly code: string; readonly detail: string };

type InstanceRow = {
    id: string;
    process_key: string | null;
    stage_key: string | null;
    metadata: Record<string, unknown> | null;
    business_process_revision_id: string | null;
    subject_id: string | null;
};

/** States in which a journey is over, and a launch would be about the wrong episode. */
const CONCLUDED = new Set(["completed", "cancelled", "canceled", "abandoned", "closed"]);

export async function previewParticipantPacketLaunch(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerMemberId: string },
): Promise<PacketLaunchPreviewResult> {
    const orgId = input.orgId.trim();
    const customerMemberId = input.customerMemberId.trim();
    if (!orgId || !customerMemberId) {
        return { ok: false, code: "invalid_input", detail: "An organization and a child are required." };
    }

    const { data: childRow, error: childErr } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name, customer_id")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .maybeSingle();
    if (childErr) return { ok: false, code: "read_failed", detail: childErr.message };
    if (!childRow) return { ok: false, code: "child_not_found", detail: "That child is not in this organization." };
    const child = childRow as {
        id: string; display_name: string | null; first_name: string | null; last_name: string | null;
        customer_id: string | null;
    };
    const childName =
        (child.display_name ?? "").trim()
        || [child.first_name, child.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" ")
        || "This child";

    // Household and location, for an operator who has several families open.
    let householdName: string | null = null;
    if (child.customer_id) {
        const { data } = await supabase
            .from("customers").select("name").eq("org_id", orgId).eq("id", child.customer_id).maybeSingle();
        householdName = ((data as { name?: string | null } | null)?.name ?? "").trim() || null;
    }
    /*
     * No location line. `customer_members` carries no location column at all — the child's placement
     * lives on the acquisition Opportunity and on the enrolment agreement, not on the member — so
     * there is nothing here to read. Naming a column the table does not have is how the packet
     * history read broke, and inventing a join for a field the preview does not need to be safe
     * would be the same mistake with better manners.
     */
    const locationName: string | null = null;

    /*
     * The child's own OPEN journey. Read, never created: a preview that started a journey would have
     * already done the thing the operator is still deciding about.
     */
    const { data: instances, error: instErr } = await supabase
        .from("process_instances")
        .select("id, process_key, stage_key, metadata, business_process_revision_id, subject_id, state")
        .eq("org_id", orgId)
        .eq("subject_id", customerMemberId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .order("created_at", { ascending: false });
    if (instErr) return { ok: false, code: "read_failed", detail: instErr.message };
    const open = ((instances ?? []) as (InstanceRow & { state?: string | null })[])
        .find((r) => !CONCLUDED.has(String(r.state ?? "").trim().toLowerCase()));

    if (!open) {
        return {
            ok: false,
            code: "no_journey",
            detail:
                "This child has no open Enrollment journey, so there is no stage whose requirements could be sent.",
        };
    }
    if (!open.business_process_revision_id) {
        return {
            ok: false,
            code: "no_governing_revision",
            detail:
                "This journey is not pinned to a published Business Process revision, so the requirements it would send cannot be established.",
        };
    }

    const configuration = await resolveProcessInstanceConfiguration({
        supabase,
        orgId,
        processInstance: {
            id: open.id,
            process_key: open.process_key ?? ENROLLMENT_PROCESS_KEY,
            stage_key: open.stage_key,
            business_process_revision_id: open.business_process_revision_id,
        },
    });
    const processKey = open.process_key ?? ENROLLMENT_PROCESS_KEY;
    const process =
        configuration.builder?.processes.find((p) => p.key === processKey)
        ?? activeLifecycleProcess(configuration.builder ?? { version: 1, active_process_id: null, processes: [] });
    const resolvedStageKey = resolveEffectiveStageKey({
        persistedStageKey: open.stage_key,
        process,
        intent: entryIntentFromProcessInstanceMetadata(open.metadata),
    });
    if (!resolvedStageKey) {
        return {
            ok: false,
            code: "no_stage",
            detail:
                "This journey has no effective stage in the governing revision, so there is no requirement set to send.",
        };
    }
    const stageKey: string = resolvedStageKey;

    // THE SAME PLANNER THE LAUNCH USES. See the header.
    const plan = planRequirementDerivedPacket({ builder: configuration.builder, processKey, stageKey });
    const section = canonicalStageRequirements(configuration.builder, stageKey, processKey);

    // Operator-facing Form names, and the version a session will pin.
    const formIds = plan.steps.map((s) => s.form_definition_id);
    const formNames = new Map<string, string>();
    const publishedLabel = new Map<string, string>();
    if (formIds.length) {
        const { data: forms } = await supabase
            .from("form_definitions").select("id, name").eq("org_id", orgId).in("id", formIds);
        for (const f of (forms ?? []) as { id: string; name: string | null }[]) {
            formNames.set(f.id, (f.name ?? "").trim() || "Untitled form");
        }
        const { data: versions } = await supabase
            .from("form_definition_versions")
            .select("id, form_definition_id, version_number, status")
            .eq("org_id", orgId)
            .in("form_definition_id", formIds)
            .eq("status", "published");
        // D-94: a session pins the CURRENT published version, which is the highest-numbered one.
        const best = new Map<string, { id: string; n: number }>();
        for (const v of (versions ?? []) as { id: string; form_definition_id: string; version_number: number }[]) {
            const held = best.get(v.form_definition_id);
            if (!held || v.version_number > held.n) best.set(v.form_definition_id, { id: v.id, n: v.version_number });
        }
        for (const [formId, v] of best) publishedLabel.set(formId, `published v${v.n}`);
    }

    const requirements: PreviewRequirement[] = plan.steps.map((step, i) => ({
        position: i + 1,
        kind: "form" as const,
        label: formNames.get(step.form_definition_id) ?? "Untitled form",
        detail: step.level === "required" ? "The family must complete this" : "Optional for the family",
        ...(publishedLabel.has(step.form_definition_id)
            ? { publishedVersionLabel: publishedLabel.get(step.form_definition_id) as string }
            : {}),
    }));

    // The fee, named and never priced here.
    const financial = (section?.requirements ?? []).filter((r) => r.ref.kind === "financial");
    if (financial.length) {
        const keys = financial.map((r) => (r.ref as { charge_template_key: string }).charge_template_key);
        const labels = new Map<string, string>();
        const { data: templates } = await supabase
            .from("charge_templates").select("template_key, label, is_active").eq("org_id", orgId).in("template_key", keys);
        for (const t of (templates ?? []) as { template_key: string; label: string | null; is_active: boolean }[]) {
            if (t.is_active !== false) labels.set(t.template_key, (t.label ?? "").trim() || t.template_key);
        }
        for (const r of financial) {
            const key = (r.ref as { charge_template_key: string }).charge_template_key;
            const perChild = r.scope === "each_child";
            requirements.push({
                position: requirements.length + 1,
                kind: "financial",
                label: labels.get(key) ?? key,
                detail:
                    (perChild ? "Owed once for this child" : "Owed once for the family")
                    + " — the amount comes from Financials when the fee becomes due",
            });
        }
    }

    const existingSession = await resolveCurrentEnrollmentSession(supabase, { orgId, processInstanceId: open.id });
    const existing = existingSession.session
        ? {
              sessionId: (existingSession.session as { id: string }).id,
              status: (existingSession.session as { status?: string | null }).status ?? null,
              participantPath: null as string | null,
          }
        : null;

    // Who receives it. The launch defaults to the household's primary person when the operator names
    // nobody, so the preview reads the same default rather than inventing one.
    let recipientName: string | null = null;
    if (child.customer_id) {
        const { data: cust } = await supabase
            .from("customers").select("primary_contact_id").eq("org_id", orgId).eq("id", child.customer_id).maybeSingle();
        const contactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
        if (contactId) {
            const { data: contact } = await supabase
                .from("contacts").select("person_id").eq("org_id", orgId).eq("id", contactId).maybeSingle();
            const personId = (contact as { person_id?: string | null } | null)?.person_id ?? null;
            if (personId) {
                const { data: person } = await supabase
                    .from("persons").select("first_name, last_name").eq("org_id", orgId).eq("id", personId).maybeSingle();
                const pr = person as { first_name?: string | null; last_name?: string | null } | null;
                recipientName =
                    [pr?.first_name, pr?.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || null;
            }
        }
    }

    const blocker =
        requirements.length === 0
            ? `The ${stageKey} stage requires no forms in the governing revision, so there is nothing to send.`
            : null;

    return {
        ok: true,
        value: {
            child: { customerMemberId, name: childName },
            householdName,
            locationName,
            recipientName,
            governing: { stageKey, businessProcessRevisionId: open.business_process_revision_id },
            requirements,
            existing,
            outcomeSentence: existing
                ? "This family already has an open packet. Confirming reopens the same one rather than sending a second."
                : "Confirming creates the packet and a private link for this child, and records who it was sent to.",
            blocker,
        },
    };
}
