"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import PrimaryButton from "@/components/PrimaryButton";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { formatDateTimeForUserDisplay } from "@/lib/adminFormatters";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ADMIN_FORMS_UI_BASE } from "@/lib/forms/adminFormsUiBase";
import { parseOperatorContext } from "@/lib/forms/operatorFormGuidance";

type FormRow = {
    id: string;
    key: string;
    name: string;
    description: string | null;
    kind: string;
    is_active: boolean;
    metadata?: Record<string, unknown>;
    updated_at: string | null;
    created_at: string;
    has_published_version?: boolean;
};

function categoryFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
    const c = metadata?.admin_category;
    return typeof c === "string" && c.trim() ? c.trim() : null;
}

function purposeSummary(metadata: Record<string, unknown> | undefined, description: string | null): string | null {
    const oc = parseOperatorContext(metadata);
    if (oc?.purpose?.trim()) return oc.purpose.trim();
    if (description?.trim()) return description.trim();
    return null;
}

function truncateText(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function FormsSeedEnvironmentHint() {
    const showExactCommand =
        process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

    return (
        <div className="mt-4 rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-4 text-sm text-[#31394d]">
            <p className="font-medium text-[#31394d]">Optional: medication demo (non-production tooling)</p>
            <p className="mt-2 leading-relaxed text-[#59678b]">
                There is <strong className="font-medium text-[#31394d]">no drag-and-drop canvas</strong> — operators configure
                fields using the structured editor on each form&apos;s page. Optional demo forms can still be installed via
                migrations/scripts.
            </p>
            {showExactCommand ? (
                <>
                    <p className="mt-2 text-sm leading-relaxed text-[#59678b]">
                        In local or Preview builds you can seed the demo medication form into your current org (requires
                        service role env):
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded-md bg-[#F4F6F9] p-3 font-mono text-xs text-[#31394d]">
                        {`cd web
DEMO_RESET_ORG_ID="<your-org-uuid>" npm run demo:seed:medication-form`}
                    </pre>
                </>
            ) : (
                <p className="mt-2 text-sm leading-relaxed text-[#59678b]">
                    On production deployments, ask your administrator to run your environment&apos;s Forms demo seed
                    runbook so this org receives configured definitions — do not run ad hoc scripts without approval.
                </p>
            )}
        </div>
    );
}

export default function FormsHubClient() {
    const router = useRouter();
    const viewerTz = useAdminViewerTimezone();
    const { canMutate } = useAdminAuth();
    const [rows, setRows] = useState<FormRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [createBusy, setCreateBusy] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);
    const [nfKey, setNfKey] = useState("");
    const [nfName, setNfName] = useState("");
    const [nfDesc, setNfDesc] = useState("");
    const [nfKind, setNfKind] = useState<"center" | "state">("center");
    const [nfCategory, setNfCategory] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/forms");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load forms");
            setRows((json as { data?: FormRow[] }).data ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const submitCreate = async () => {
        if (!canMutate) return;
        setCreateBusy(true);
        setCreateErr(null);
        try {
            const res = await fetch("/api/admin/forms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: nfKey.trim(),
                    name: nfName.trim(),
                    description: nfDesc.trim() || null,
                    kind: nfKind,
                    admin_category: nfCategory.trim() || undefined,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create form");
            const id = (json as { data?: { id: string } }).data?.id;
            if (!id) throw new Error("Missing id");
            setShowCreate(false);
            setNfKey("");
            setNfName("");
            setNfDesc("");
            setNfCategory("");
            router.push(`${ADMIN_FORMS_UI_BASE}/${id}`);
        } catch (e) {
            setCreateErr((e as Error).message);
        } finally {
            setCreateBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Forms"
                subtitle="Collect information from families and staff with versioned definitions, public links, and submissions — without leaving Admin."
            />

            <p className="text-sm text-[#59678b]">
                <Link href="/adminV2/forms/packets" className="font-medium text-[#2563eb] hover:underline">
                    Packet sessions
                </Link>
                {" — review runs. "}
                <Link href="/adminV2/forms/packet-definitions" className="font-medium text-[#2563eb] hover:underline">
                    Packet definitions
                </Link>
                {" — configure multi-form packets."}
            </p>

            <SectionCard title="Forms in Alloy">
                <div className="space-y-4 text-sm leading-relaxed text-[#31394d]">
                    <p className="text-[#59678b]">
                        Use this area to open each form&apos;s <strong className="font-medium text-[#31394d]">workspace</strong>
                        : guidance for operators, public links, preview, and submissions for that definition.
                    </p>
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-[#59678b]">How Forms usually flow</h3>
                        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[#31394d]">
                            <li>
                                <strong className="font-medium">Choose a form</strong> below and open its workspace.
                            </li>
                            <li>
                                <strong className="font-medium">Preview</strong> or <strong className="font-medium">create a public link</strong>{" "}
                                so the right person can complete it (same embed experience they see in production).
                            </li>
                            <li>
                                The <strong className="font-medium">recipient submits</strong> — drafts and submissions appear under{" "}
                                <strong className="font-medium">Submissions</strong>.
                            </li>
                            <li>
                                <strong className="font-medium">Review</strong> answers and linked CRM rows from each submission.
                            </li>
                            <li>
                                When configured, <strong className="font-medium">generate or open linked documents</strong> (e.g. PDF stub)
                                from the submission detail page.
                            </li>
                        </ol>
                    </div>
                    <p className="border-t border-[#e6e8ec] pt-3 text-xs text-[#59678b]">
                        Definitions use the shared{" "}
                        <strong className="font-medium text-[#31394d]">schema_version: 1</strong> contract (validated + rendered by
                        the same engine as public embeds). Tailored operator notes can live in{" "}
                        <code className="rounded bg-[#F4F6F9] px-1 font-mono text-[11px]">metadata.operator_context</code>.
                    </p>
                </div>
            </SectionCard>

            <SectionCard title="Your forms">
                {canMutate ? (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" onClick={() => setShowCreate((v) => !v)}>
                            {showCreate ? "Close create form" : "Create new form"}
                        </PrimaryButton>
                    </div>
                ) : null}
                {showCreate && canMutate ? (
                    <div className="mb-5 space-y-3 rounded-lg border border-[#e6e8ec] bg-[#fafbfd] p-4 text-sm">
                        <p className="text-xs text-[#59678b]">
                            Keys must stay stable — they are used in integrations. Use lowercase with underscores (e.g.{" "}
                            <span className="font-mono">waitlist_intake_v1</span>).
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Key</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 font-mono text-sm"
                                    value={nfKey}
                                    onChange={(e) => setNfKey(e.target.value)}
                                    placeholder="waitlist_intake_v1"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Name</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    value={nfName}
                                    onChange={(e) => setNfName(e.target.value)}
                                    placeholder="Waitlist intake"
                                />
                            </label>
                            <label className="space-y-1 sm:col-span-2">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Description (optional)</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    value={nfDesc}
                                    onChange={(e) => setNfDesc(e.target.value)}
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Kind</span>
                                <select
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    value={nfKind}
                                    onChange={(e) => setNfKind(e.target.value as "center" | "state")}
                                >
                                    <option value="center">center</option>
                                    <option value="state">state</option>
                                </select>
                            </label>
                            <label className="space-y-1">
                                <span className="text-xs font-semibold uppercase text-[#59678b]">Category (metadata)</span>
                                <input
                                    className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                                    value={nfCategory}
                                    onChange={(e) => setNfCategory(e.target.value)}
                                    placeholder="e.g. Intake"
                                />
                            </label>
                        </div>
                        {createErr ? <p className="text-sm text-red-700">{createErr}</p> : null}
                        <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={createBusy} onClick={() => void submitCreate()}>
                            {createBusy ? "Creating…" : "Create and open workspace"}
                        </PrimaryButton>
                    </div>
                ) : null}
                {loading ? (
                    <p className="text-sm text-[#59678b]">Loading…</p>
                ) : error ? (
                    <p className="text-sm text-red-700">{error}</p>
                ) : rows.length === 0 ? (
                    <div className="space-y-3 text-sm">
                        <p className="font-medium text-[#31394d]">No forms are configured for this organization yet.</p>
                        <p className="leading-relaxed text-[#59678b]">
                            That usually means no form definitions have been seeded or provisioned for your{" "}
                            <code className="rounded bg-[#F4F6F9] px-1 font-mono text-[11px]">org_id</code>. This is expected on a
                            fresh tenant until your team loads the Forms package you need.
                        </p>
                        <p className="leading-relaxed text-[#59678b]">
                            Create a form below, add fields on the form workspace, publish a version, then use it in a packet or
                            standalone public link.
                        </p>
                        <FormsSeedEnvironmentHint />
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec]">
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Form</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Purpose / description</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Key</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Category</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Kind</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Definition</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Published</th>
                                    <th className="pb-2 pr-4 text-left font-semibold text-[#59678b]">Updated</th>
                                    <th className="pb-2 text-left font-semibold text-[#59678b]">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#e6e8ec]">
                                {rows.map((r) => {
                                    const purpose = purposeSummary(r.metadata, r.description);
                                    const workspaceHref = `${ADMIN_FORMS_UI_BASE}/${r.id}`;
                                    const published = r.has_published_version === true;
                                    const cat = categoryFromMetadata(r.metadata);
                                    return (
                                        <tr key={r.id} className="hover:bg-[#F4F6F9]/50">
                                            <td className="max-w-[200px] py-2.5 pr-4">
                                                <span className="font-medium text-[#31394d]">{r.name}</span>
                                            </td>
                                            <td className="max-w-[280px] py-2.5 pr-4 text-[#59678b]">
                                                {purpose ? (
                                                    <span title={purpose}>{truncateText(purpose, 140)}</span>
                                                ) : (
                                                    <span className="italic text-[#59678b]">No description yet</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4 font-mono text-xs text-[#31394d]">{r.key}</td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">{cat ?? "—"}</td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">{r.kind}</td>
                                            <td className="py-2.5 pr-4">
                                                <StatusBadge
                                                    label={r.is_active ? "Active" : "Inactive"}
                                                    variant={getStatusVariant(r.is_active ? "active" : "inactive")}
                                                />
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {published ? (
                                                    <StatusBadge label="Published version" variant="success" />
                                                ) : (
                                                    <span className="text-xs text-[#59678b]">No published version</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4 text-[#59678b]">
                                                {r.updated_at ? formatDateTimeForUserDisplay(r.updated_at, viewerTz) : "—"}
                                            </td>
                                            <td className="py-2.5">
                                                <Link
                                                    href={workspaceHref}
                                                    className="font-semibold text-[#00458C] hover:underline"
                                                >
                                                    Open form workspace
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </div>
    );
}
