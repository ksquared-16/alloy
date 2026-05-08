import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ItemRow = {
    id: string;
    sequence_index: number;
    status: string;
    submitted_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    skip_reason: string | null;
    form_submission_id: string | null;
    form_definition_id: string | null;
    form_name: string | null;
    form_key: string | null;
};

type SubmissionLite = {
    id: string;
    status: string;
    submitted_at: string | null;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    payload: Record<string, unknown> | null;
};

function parseSubmissionPayloadMeta(payload: Record<string, unknown> | null): {
    intake_needs_review: boolean;
    intake_review_reason: string | null;
    intake_resolution_path: string | null;
    intake_match_strategy: string | null;
} {
    if (!payload) {
        return {
            intake_needs_review: false,
            intake_review_reason: null,
            intake_resolution_path: null,
            intake_match_strategy: null,
        };
    }
    const meta =
        payload.meta && typeof payload.meta === "object" && !Array.isArray(payload.meta)
            ? (payload.meta as Record<string, unknown>)
            : {};
    return {
        intake_needs_review: meta.intake_needs_review === true,
        intake_review_reason: typeof meta.intake_review_reason === "string" ? meta.intake_review_reason : null,
        intake_resolution_path: typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path : null,
        intake_match_strategy: typeof meta.intake_match_strategy === "string" ? meta.intake_match_strategy : null,
    };
}

function hasAnySubmissionFk(sub: SubmissionLite | undefined): boolean {
    if (!sub) return false;
    return !!(
        sub.person_id ||
        sub.customer_id ||
        sub.customer_member_id ||
        sub.opportunity_id
    );
}

function JsonPanel({
    title,
    subtitle,
    value,
}: {
    title: string;
    subtitle?: string;
    value: unknown;
}) {
    return (
        <div className="rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-3 text-xs text-[#59678b]">
            <p className="font-medium text-[#31394d]">{title}</p>
            {subtitle ? <p className="mt-1 text-[11px] leading-snug text-[#59678b]">{subtitle}</p> : null}
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[#31394d]">
                {JSON.stringify(value ?? {}, null, 2)}
            </pre>
        </div>
    );
}

export default async function AdminV2PacketSessionDetailPage({
    params,
}: {
    params: Promise<{ packetSessionId: string }>;
}) {
    const auth = await getAdminAuth();
    if (!auth?.user?.id || !auth.orgId) {
        redirect("/unauthorized");
    }

    const { packetSessionId } = await params;
    const UUID_RE =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(packetSessionId)) notFound();

    const supabase = createAdminClient();

    const { data: session, error: sErr } = await supabase
        .from("form_packet_sessions")
        .select(
            `
        id,
        status,
        created_at,
        completed_at,
        packet_definition_id,
        started_via_public_link_id,
        current_sequence_index,
        launch_context,
        crm_snapshot,
        shared_values,
        form_packet_definitions ( id, name, key )
      `
        )
        .eq("id", packetSessionId)
        .eq("org_id", auth.orgId)
        .maybeSingle();

    if (sErr) {
        return <div className="p-6 text-sm text-red-700">Failed to load session: {sErr.message}</div>;
    }
    if (!session) notFound();

    const { data: items, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select(
            "id, sequence_index, status, submitted_at, created_at, updated_at, form_submission_id, packet_item_id, skip_reason"
        )
        .eq("packet_session_id", packetSessionId)
        .eq("org_id", auth.orgId)
        .order("sequence_index", { ascending: true });

    if (iErr) {
        return <div className="p-6 text-sm text-red-700">Failed to load steps: {iErr.message}</div>;
    }

    const packetItemIds = [...new Set((items ?? []).map((r: { packet_item_id: string }) => r.packet_item_id))];
    const defItemMap: Record<string, { form_definition_id: string }> = {};
    if (packetItemIds.length > 0) {
        const { data: di } = await supabase
            .from("form_packet_items")
            .select("id, form_definition_id")
            .in("id", packetItemIds)
            .eq("org_id", auth.orgId);
        for (const row of di ?? []) {
            const r = row as { id: string; form_definition_id: string };
            defItemMap[r.id] = { form_definition_id: r.form_definition_id };
        }
    }

    const formIds = [...new Set(Object.values(defItemMap).map((d) => d.form_definition_id))];
    const formMeta: Record<string, { name: string; key: string }> = {};
    if (formIds.length > 0) {
        const { data: forms } = await supabase
            .from("form_definitions")
            .select("id, name, key")
            .in("id", formIds)
            .eq("org_id", auth.orgId);
        for (const row of forms ?? []) {
            const r = row as { id: string; name: string; key: string };
            formMeta[r.id] = { name: r.name, key: r.key };
        }
    }

    const enriched: ItemRow[] = (items ?? []).map((it: Record<string, unknown>) => {
        const pid = it.packet_item_id as string;
        const fdid = defItemMap[pid]?.form_definition_id ?? null;
        const fm = fdid ? formMeta[fdid] : undefined;
        return {
            id: it.id as string,
            sequence_index: it.sequence_index as number,
            status: it.status as string,
            submitted_at: (it.submitted_at as string | null) ?? null,
            created_at: (it.created_at as string | null) ?? null,
            updated_at: (it.updated_at as string | null) ?? null,
            skip_reason: (it.skip_reason as string | null) ?? null,
            form_submission_id: (it.form_submission_id as string | null) ?? null,
            form_definition_id: fdid,
            form_name: fm?.name ?? null,
            form_key: fm?.key ?? null,
        };
    });

    const submissionIds = [...new Set(enriched.map((e) => e.form_submission_id).filter(Boolean))] as string[];

    const submissionById: Record<string, SubmissionLite> = {};
    if (submissionIds.length > 0) {
        const { data: subs } = await supabase
            .from("form_submissions")
            .select("id, status, submitted_at, person_id, customer_id, customer_member_id, opportunity_id, payload")
            .eq("org_id", auth.orgId)
            .in("id", submissionIds);

        for (const raw of subs ?? []) {
            const s = raw as SubmissionLite;
            submissionById[s.id] = {
                ...s,
                payload:
                    s.payload && typeof s.payload === "object" && !Array.isArray(s.payload)
                        ? (s.payload as Record<string, unknown>)
                        : null,
            };
        }
    }

    const pktDef = session.form_packet_definitions as { name?: string; key?: string } | { name?: string; key?: string }[] | null;
    const pktName = Array.isArray(pktDef) ? pktDef[0]?.name : pktDef?.name;

    const crm = (session.crm_snapshot ?? {}) as Record<string, unknown>;
    const launchCtx = (session.launch_context ?? {}) as Record<string, unknown>;
    const sharedVals = (session.shared_values ?? {}) as Record<string, unknown>;

    const totalSteps = enriched.length;
    const currentSeq = session.current_sequence_index as number;
    const anyStepNeedsReview = enriched.some((step) => {
        const sub = step.form_submission_id ? submissionById[step.form_submission_id] : undefined;
        return parseSubmissionPayloadMeta(sub?.payload ?? null).intake_needs_review;
    });

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6 text-[#31394d]">
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/adminV2/forms/packets" className="text-sm font-medium text-[#59678b] hover:text-[#0f172a]">
                    ← Packet sessions
                </Link>
            </div>

            <div>
                <h1 className="text-xl font-semibold text-[#0f172a]">{pktName ?? "Packet session"}</h1>
                <p className="mt-2 text-sm text-[#59678b]">
                    Status: <span className="font-medium text-[#31394d]">{session.status}</span>
                    {" · "}Current sequence index:{" "}
                    <span className="font-medium text-[#31394d]">{currentSeq}</span>
                    {totalSteps > 0 ?
                        <>
                            {" "}
                            (step {currentSeq + 1} of {totalSteps} in UI order)
                        </>
                    : null}
                    {" · "}Started {new Date(session.created_at as string).toLocaleString()}
                    {session.completed_at ?
                        ` · Completed ${new Date(session.completed_at as string).toLocaleString()}`
                    : ""}
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#59678b]">
                    Session <span className="text-[#31394d]">{session.id as string}</span>
                    {" · "}Link <span className="text-[#31394d]">{session.started_via_public_link_id as string}</span>
                </p>
                {anyStepNeedsReview ?
                    <div
                        role="status"
                        className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                    >
                        One or more steps have{" "}
                        <span className="font-medium">intake_needs_review</span> — open each submission to confirm or
                        correct linkage.
                    </div>
                : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <JsonPanel
                    title="Launch context"
                    subtitle="Trusted server copy stamped at session creation (prefill / intake flags, source entity, packet id)."
                    value={launchCtx}
                />
                <JsonPanel
                    title="CRM snapshot (canonical for packet)"
                    subtitle="Merged after each submitted step; later drafts inherit FKs from here + launch metadata."
                    value={crm}
                />
            </div>

            <JsonPanel
                title="Shared values"
                subtitle="Scalar merge across steps (payload.values only); inspect carry-forward for enrollment pilots."
                value={sharedVals}
            />

            <div>
                <h2 className="text-sm font-semibold text-[#0f172a]">Steps</h2>
                <ul className="mt-2 divide-y divide-[#e6e8ec] rounded-lg border border-[#e6e8ec] bg-white">
                    {enriched.map((step) => {
                        const sub = step.form_submission_id ? submissionById[step.form_submission_id] : undefined;
                        const meta = parseSubmissionPayloadMeta(sub?.payload ?? null);
                        const fkOk = hasAnySubmissionFk(sub);
                        return (
                            <li key={step.id} className="flex flex-col gap-2 px-4 py-3 text-sm">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <span className="font-medium text-[#0f172a]">
                                        Step {step.sequence_index + 1}: {step.form_name ?? step.form_key ?? "Form"}
                                    </span>
                                    <span className="text-xs uppercase tracking-wide text-[#59678b]">{step.status}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                    {step.form_submission_id ?
                                        <span className="rounded bg-[#f4f6f9] px-1.5 py-0.5 font-mono text-[#31394d]">
                                            submission {step.form_submission_id}
                                        </span>
                                    : null}
                                    {sub ?
                                        <span className="rounded bg-[#f4f6f9] px-1.5 py-0.5 font-mono text-[#31394d]">
                                            {sub.status}
                                        </span>
                                    : null}
                                    {meta.intake_resolution_path ?
                                        <span className="rounded border border-[#e6e8ec] px-1.5 py-0.5 text-[#59678b]">
                                            intake: {meta.intake_resolution_path}
                                        </span>
                                    : null}
                                    {meta.intake_match_strategy ?
                                        <span className="rounded border border-[#e6e8ec] px-1.5 py-0.5 text-[#59678b]">
                                            match: {meta.intake_match_strategy}
                                        </span>
                                    : null}
                                    {meta.intake_needs_review ?
                                        <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-950">
                                            review needed
                                        </span>
                                    : null}
                                    {!fkOk && sub?.status === "submitted" ?
                                        <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-800">
                                            no CRM FK on submission
                                        </span>
                                    : null}
                                    {fkOk ?
                                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-900">
                                            CRM linked
                                        </span>
                                    : null}
                                </div>
                                {meta.intake_review_reason ?
                                    <p className="text-xs leading-snug text-[#59678b]">{meta.intake_review_reason}</p>
                                : null}
                                <div className="text-[11px] text-[#59678b]">
                                    {step.created_at ? <>Item created {new Date(step.created_at).toLocaleString()} · </> : null}
                                    {step.submitted_at ?
                                        <>Step submitted_at {new Date(step.submitted_at).toLocaleString()} · </>
                                    : null}
                                    {sub?.submitted_at ?
                                        <>Submission submitted_at {new Date(sub.submitted_at).toLocaleString()}</>
                                    : null}
                                    {step.skip_reason ?
                                        <>
                                            <span className="mt-1 block text-amber-800">Skip: {step.skip_reason}</span>
                                        </>
                                    : null}
                                </div>
                                {step.form_submission_id && step.form_definition_id ?
                                    <Link
                                        href={`/adminV2/forms/${step.form_definition_id}/submissions/${step.form_submission_id}`}
                                        className="text-sm font-medium text-[#2563eb] hover:underline"
                                    >
                                        Open submission
                                    </Link>
                                : null}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
