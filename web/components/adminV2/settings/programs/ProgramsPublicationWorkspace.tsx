"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ConfigurationPrimaryButton,
    ConfigurationQueueItem,
    ConfigurationSecondaryButton,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import {
    ConfigConsequenceLine,
    ConfigObjectHeader,
} from "@/components/adminV2/settings/configurationRuntime/workspace";
import type { ConfigurationTargetPreview } from "@/lib/configPublication/types";
import type {
    ProgramCatalogItem,
    ProgramPublicationSnapshot,
} from "@/lib/programs/publication/programPublicationService";

const ENDPOINT = "/api/admin/configuration/programs";

type DraftForm = {
    label: string;
    description: string;
    category: string;
    requiredResourceType: string;
    minimumAge: string;
    maximumAge: string;
    qualificationRequirements: string;
};

function formFor(program: ProgramCatalogItem): DraftForm {
    return {
        label: program.draft.label,
        description: program.draft.description ?? "",
        category: program.draft.category ?? "",
        requiredResourceType: program.draft.requiredResourceType ?? "",
        minimumAge:
            typeof program.draft.audience.minimumAge === "number"
                ? String(program.draft.audience.minimumAge)
                : "",
        maximumAge:
            typeof program.draft.audience.maximumAge === "number"
                ? String(program.draft.audience.maximumAge)
                : "",
        qualificationRequirements: program.draft.qualificationRequirements
            .map(String)
            .join("\n"),
    };
}

function optionalNumber(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function publicationLabel(program: ProgramCatalogItem): string {
    if (!program.latestPublication) return "Draft only";
    if (program.draft.baseRevisionId === program.latestPublication.revision.id) {
        return `Published · Revision ${program.latestPublication.revision.number}`;
    }
    return `Changes ready after Revision ${program.latestPublication.revision.number}`;
}

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(json.error ?? `Request failed (${response.status})`));
    return json;
}

export default function ProgramsPublicationWorkspace() {
    const [snapshot, setSnapshot] = useState<ProgramPublicationSnapshot | null>(null);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
    const [form, setForm] = useState<DraftForm | null>(null);
    const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
    const [preview, setPreview] = useState<ConfigurationTargetPreview[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createKey, setCreateKey] = useState("");

    const reload = useCallback(async () => {
        const response = await fetch(ENDPOINT, { credentials: "include" });
        const json = (await response.json().catch(() => ({}))) as ProgramPublicationSnapshot & {
            error?: string;
        };
        if (!response.ok) throw new Error(json.error ?? `Failed (${response.status})`);
        setSnapshot(json);
        setSelectedProgramId((current) => {
            if (current && json.programs.some((program) => program.id === current)) return current;
            return json.programs[0]?.id ?? null;
        });
    }, []);

    useEffect(() => {
        void reload()
            .catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Programs could not load."))
            .finally(() => setLoading(false));
    }, [reload]);

    const selectedProgram = useMemo(
        () => snapshot?.programs.find((program) => program.id === selectedProgramId) ?? null,
        [selectedProgramId, snapshot],
    );

    useEffect(() => {
        setForm(selectedProgram ? formFor(selectedProgram) : null);
        setPreview(null);
        setSelectedLocationIds([]);
    }, [selectedProgram]);

    const run = useCallback(
        async (key: string, action: () => Promise<unknown>, options?: { reload?: boolean }) => {
            setWorking(key);
            setError(null);
            try {
                await action();
                if (options?.reload !== false) await reload();
            } catch (nextError) {
                setError(nextError instanceof Error ? nextError.message : "The action could not be completed.");
            } finally {
                setWorking(null);
            }
        },
        [reload],
    );

    if (loading) {
        return <p className="p-6 text-sm text-alloy-midnight/55">Loading Programs…</p>;
    }

    return (
        <div className="config-runtime-shell flex min-h-0 flex-1 flex-col" data-testid="programs-publication-runtime">
            <header className="border-b border-alloy-stone/20 bg-white px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-alloy-midnight/45">
                            <Link href="/organization" className="hover:text-alloy-bend-pine">
                                Organization
                            </Link>
                            <span>/</span>
                            <span>Programs</span>
                        </div>
                        <h1 className="mt-1 text-xl font-semibold text-alloy-midnight">Programs</h1>
                        <p className="mt-1 text-sm text-alloy-midnight/55">
                            Author reusable services, publish governed revisions, and deliver them to Locations.
                        </p>
                    </div>
                    <ConfigurationPrimaryButton onClick={() => setCreateOpen((open) => !open)}>
                        {createOpen ? "Cancel" : "New Program"}
                    </ConfigurationPrimaryButton>
                </div>
                {createOpen ? (
                    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-alloy-stone/20 bg-alloy-stone/10 p-3">
                        <label className="min-w-48 flex-1">
                            <span className="config-typo-field-label">Program name</span>
                            <input
                                value={createName}
                                onChange={(event) => setCreateName(event.target.value)}
                                className="config-runtime-input mt-1"
                                data-testid="program-create-name"
                            />
                        </label>
                        <label className="min-w-40">
                            <span className="config-typo-field-label">Stable key</span>
                            <input
                                value={createKey}
                                onChange={(event) => setCreateKey(event.target.value)}
                                placeholder="preschool"
                                className="config-runtime-input mt-1 font-mono"
                                data-testid="program-create-key"
                            />
                        </label>
                        <ConfigurationPrimaryButton
                            disabled={!createName.trim() || !createKey.trim() || working != null}
                            data-testid="program-create-submit"
                            onClick={() =>
                                void run("create", async () => {
                                    const result = await postAction({
                                        action: "create_draft",
                                        label: createName,
                                        key: createKey,
                                    });
                                    setSelectedProgramId(String(result.programId ?? ""));
                                    setCreateName("");
                                    setCreateKey("");
                                    setCreateOpen(false);
                                })
                            }
                        >
                            {working === "create" ? "Creating…" : "Create draft"}
                        </ConfigurationPrimaryButton>
                    </div>
                ) : null}
                {error ? (
                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                        {error}
                    </p>
                ) : null}
            </header>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[250px_minmax(0,1fr)]">
                <aside className="overflow-y-auto border-r border-alloy-stone/20 bg-white p-3" aria-label="Programs">
                    <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Program catalog · {snapshot?.programs.length ?? 0}
                    </p>
                    {snapshot?.programs.map((program) => (
                        <ConfigurationQueueItem
                            key={program.id}
                            variant="rail"
                            active={program.id === selectedProgramId}
                            title={program.draft.label}
                            subtitle={publicationLabel(program)}
                            onClick={() => setSelectedProgramId(program.id)}
                            testId={`program-catalog-${program.id}`}
                        />
                    ))}
                    {snapshot?.programs.length === 0 ? (
                        <p className="px-2 py-6 text-sm text-alloy-midnight/45">
                            Create the first Organization Program draft.
                        </p>
                    ) : null}
                </aside>

                <main className="overflow-y-auto bg-alloy-stone/10 p-5">
                    {!selectedProgram || !form ? (
                        <div className="rounded-xl border border-dashed border-alloy-stone/30 bg-white p-8 text-center text-sm text-alloy-midnight/50">
                            Choose a Program or create a draft.
                        </div>
                    ) : (
                        <div className="mx-auto max-w-5xl space-y-5">
                            <ConfigObjectHeader
                                size="hero"
                                name={selectedProgram.draft.label}
                                status={{
                                    label: publicationLabel(selectedProgram),
                                    tone:
                                        selectedProgram.draft.status === "validated"
                                            ? "active"
                                            : "attention",
                                }}
                                facts={[
                                    `Key · ${selectedProgram.key}`,
                                    `${selectedProgram.revisions.length} published revision${
                                        selectedProgram.revisions.length === 1 ? "" : "s"
                                    }`,
                                ]}
                                testId="program-object-header"
                            />
                            <ConfigConsequenceLine>
                                Locations consume published Program identity. Local availability, evidence, resources, and
                                schedules remain Location-owned.
                            </ConfigConsequenceLine>

                            <section className="rounded-xl border border-alloy-stone/20 bg-white p-5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h2 className="config-typo-workspace-title">Organization draft</h2>
                                        <p className="mt-1 text-xs text-alloy-midnight/50">
                                            Editing never changes the currently published revision.
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-alloy-stone/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55">
                                        {selectedProgram.draft.status}
                                    </span>
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <label>
                                        <span className="config-typo-field-label">Name · Organization locked</span>
                                        <input
                                            value={form.label}
                                            onChange={(event) => setForm({ ...form, label: event.target.value })}
                                            className="config-runtime-input mt-1"
                                            data-testid="program-draft-label"
                                        />
                                    </label>
                                    <label>
                                        <span className="config-typo-field-label">Category · Organization locked</span>
                                        <input
                                            value={form.category}
                                            onChange={(event) => setForm({ ...form, category: event.target.value })}
                                            className="config-runtime-input mt-1"
                                        />
                                    </label>
                                    <label className="sm:col-span-2">
                                        <span className="config-typo-field-label">Description · Location may override</span>
                                        <textarea
                                            value={form.description}
                                            onChange={(event) => setForm({ ...form, description: event.target.value })}
                                            className="config-runtime-input mt-1 min-h-20"
                                        />
                                    </label>
                                    <label>
                                        <span className="config-typo-field-label">Minimum audience age</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={form.minimumAge}
                                            onChange={(event) => setForm({ ...form, minimumAge: event.target.value })}
                                            className="config-runtime-input mt-1"
                                        />
                                    </label>
                                    <label>
                                        <span className="config-typo-field-label">Maximum audience age</span>
                                        <input
                                            type="number"
                                            min={0}
                                            value={form.maximumAge}
                                            onChange={(event) => setForm({ ...form, maximumAge: event.target.value })}
                                            className="config-runtime-input mt-1"
                                        />
                                    </label>
                                    <label>
                                        <span className="config-typo-field-label">Required resource type</span>
                                        <input
                                            value={form.requiredResourceType}
                                            onChange={(event) =>
                                                setForm({ ...form, requiredResourceType: event.target.value })
                                            }
                                            placeholder="Classroom"
                                            className="config-runtime-input mt-1"
                                        />
                                    </label>
                                    <label>
                                        <span className="config-typo-field-label">Qualification requirements</span>
                                        <textarea
                                            value={form.qualificationRequirements}
                                            onChange={(event) =>
                                                setForm({ ...form, qualificationRequirements: event.target.value })
                                            }
                                            placeholder="One requirement per line"
                                            className="config-runtime-input mt-1 min-h-20"
                                        />
                                    </label>
                                </div>
                                {selectedProgram.draft.validationErrors.length > 0 ? (
                                    <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
                                        {selectedProgram.draft.validationErrors.map((item) => (
                                            <li key={item}>{item}</li>
                                        ))}
                                    </ul>
                                ) : null}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <ConfigurationPrimaryButton
                                        disabled={working != null}
                                        data-testid="program-save-draft"
                                        onClick={() =>
                                            void run("save", () =>
                                                postAction({
                                                    action: "update_draft",
                                                    programId: selectedProgram.id,
                                                    patch: {
                                                        label: form.label,
                                                        description: form.description.trim() || null,
                                                        category: form.category.trim() || null,
                                                        required_resource_type:
                                                            form.requiredResourceType.trim() || null,
                                                        audience: {
                                                            minimumAge: optionalNumber(form.minimumAge),
                                                            maximumAge: optionalNumber(form.maximumAge),
                                                        },
                                                        qualification_requirements:
                                                            form.qualificationRequirements
                                                                .split("\n")
                                                                .map((value) => value.trim())
                                                                .filter(Boolean),
                                                    },
                                                }),
                                            )
                                        }
                                    >
                                        {working === "save" ? "Saving…" : "Save draft"}
                                    </ConfigurationPrimaryButton>
                                    <ConfigurationSecondaryButton
                                        disabled={working != null}
                                        data-testid="program-validate-draft"
                                        onClick={() =>
                                            void run("validate", () =>
                                                postAction({
                                                    action: "validate_draft",
                                                    programId: selectedProgram.id,
                                                }),
                                            )
                                        }
                                    >
                                        {working === "validate" ? "Validating…" : "Validate"}
                                    </ConfigurationSecondaryButton>
                                    <ConfigurationSecondaryButton
                                        disabled={selectedProgram.draft.status !== "validated" || working != null}
                                        data-testid="program-publish"
                                        onClick={() =>
                                            void run("publish", () =>
                                                postAction({
                                                    action: "publish",
                                                    programId: selectedProgram.id,
                                                }),
                                            )
                                        }
                                    >
                                        {working === "publish" ? "Publishing…" : "Publish immutable revision"}
                                    </ConfigurationSecondaryButton>
                                </div>
                            </section>

                            <section className="rounded-xl border border-alloy-stone/20 bg-white p-5">
                                <h2 className="config-typo-workspace-title">Assign to Locations</h2>
                                {!selectedProgram.latestPublication ? (
                                    <p className="mt-2 text-sm text-alloy-midnight/55">
                                        Publish this Program before selecting Locations.
                                    </p>
                                ) : (
                                    <>
                                        <p className="mt-1 text-xs text-alloy-midnight/50">
                                            Revision {selectedProgram.latestPublication.revision.number} · local offer
                                            state, evidence, room assignments, and schedules are protected.
                                        </p>
                                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                            {snapshot?.locations.map((location) => (
                                                <label
                                                    key={location.id}
                                                    className="flex items-center gap-2 rounded-lg border border-alloy-stone/15 px-3 py-2 text-sm"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedLocationIds.includes(location.id)}
                                                        onChange={(event) =>
                                                            setSelectedLocationIds((current) =>
                                                                event.target.checked
                                                                    ? [...current, location.id]
                                                                    : current.filter((id) => id !== location.id),
                                                            )
                                                        }
                                                    />
                                                    <span>{location.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <ConfigurationSecondaryButton
                                                disabled={selectedLocationIds.length === 0 || working != null}
                                                data-testid="program-preview-delivery"
                                                onClick={() =>
                                                    void run(
                                                        "preview",
                                                        async () => {
                                                            const result = await postAction({
                                                                action: "preview",
                                                                publicationId:
                                                                    selectedProgram.latestPublication!.id,
                                                                targetIds: selectedLocationIds,
                                                            });
                                                            setPreview(
                                                                (result.preview as ConfigurationTargetPreview[]) ?? [],
                                                            );
                                                        },
                                                        { reload: false },
                                                    )
                                                }
                                            >
                                                {working === "preview" ? "Previewing…" : "Preview impact"}
                                            </ConfigurationSecondaryButton>
                                            <ConfigurationPrimaryButton
                                                disabled={!preview || preview.length === 0 || working != null}
                                                data-testid="program-assign-delivery"
                                                onClick={() =>
                                                    void run("assign", async () => {
                                                        await postAction({
                                                            action: "assign",
                                                            publicationId: selectedProgram.latestPublication!.id,
                                                            targetIds: selectedLocationIds,
                                                        });
                                                        setPreview(null);
                                                    })
                                                }
                                            >
                                                {working === "assign" ? "Assigning…" : "Confirm assignment"}
                                            </ConfigurationPrimaryButton>
                                        </div>
                                        {preview ? (
                                            <div className="mt-4 space-y-2" data-testid="program-delivery-preview">
                                                {preview.map((target) => (
                                                    <div
                                                        key={target.locationId}
                                                        className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 p-3"
                                                    >
                                                        <div className="flex justify-between gap-2">
                                                            <strong className="text-sm text-alloy-midnight">
                                                                {target.locationLabel}
                                                            </strong>
                                                            <span className="text-xs text-alloy-midnight/45">
                                                                {target.currentRevisionId === target.nextRevisionId
                                                                    ? "Current"
                                                                    : "Update ready"}
                                                            </span>
                                                        </div>
                                                        <ul className="mt-2 space-y-1 text-xs text-alloy-midnight/60">
                                                            {target.impacts.map((impact) => (
                                                                <li key={`${impact.fieldKey}-${impact.kind}`}>
                                                                    {impact.message}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </>
                                )}
                            </section>

                            <section className="rounded-xl border border-alloy-stone/20 bg-white p-5">
                                <h2 className="config-typo-workspace-title">Published and delivery history</h2>
                                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                                    <div>
                                        <p className="config-typo-field-label">Published revisions</p>
                                        <div className="mt-2 space-y-2">
                                            {selectedProgram.revisions.map((revision, index) => (
                                                <div
                                                    key={revision.id}
                                                    className="rounded-lg border border-alloy-stone/15 px-3 py-2"
                                                >
                                                    <div className="flex justify-between text-sm">
                                                        <span>Revision {revision.revisionNumber}</span>
                                                        <span className="text-alloy-midnight/45">
                                                            {index === 0 ? "Published" : "Superseded"}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-xs text-alloy-midnight/45">
                                                        {new Date(revision.publishedAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            ))}
                                            {selectedProgram.revisions.length === 0 ? (
                                                <p className="text-sm text-alloy-midnight/45">Nothing published yet.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="config-typo-field-label">Location deliveries</p>
                                        <div className="mt-2 space-y-2">
                                            {snapshot?.runs
                                                .filter(
                                                    (run) =>
                                                        run.publicationId
                                                        === selectedProgram.latestPublication?.id,
                                                )
                                                .map((deliveryRun) => (
                                                    <div
                                                        key={deliveryRun.id}
                                                        className="rounded-lg border border-alloy-stone/15 px-3 py-2"
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className="text-sm capitalize">
                                                                {deliveryRun.status.replace("_", " ")}
                                                            </span>
                                                            {deliveryRun.targets.some(
                                                                (target) => target.status === "failed",
                                                            ) ? (
                                                                <button
                                                                    type="button"
                                                                    className="text-xs font-medium text-alloy-bend-pine hover:underline"
                                                                    disabled={working != null}
                                                                    onClick={() =>
                                                                        void run("retry", () =>
                                                                            postAction({
                                                                                action: "retry",
                                                                                runId: deliveryRun.id,
                                                                            }),
                                                                        )
                                                                    }
                                                                >
                                                                    Retry failed
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                        <p className="mt-1 text-xs text-alloy-midnight/45">
                                                            {deliveryRun.targets.filter((target) =>
                                                                ["delivered", "unchanged"].includes(target.status),
                                                            ).length}{" "}
                                                            succeeded ·{" "}
                                                            {deliveryRun.targets.filter((target) => target.status === "failed").length}{" "}
                                                            failed
                                                        </p>
                                                        {deliveryRun.targets
                                                            .filter((target) => target.status === "failed")
                                                            .map((target) => (
                                                                <p
                                                                    key={target.id}
                                                                    className="mt-1 text-xs text-red-700"
                                                                >
                                                                    {snapshot.locations.find(
                                                                        (location) =>
                                                                            location.id === target.locationId,
                                                                    )?.label ?? "Location"}
                                                                    : {target.errorMessage}
                                                                </p>
                                                            ))}
                                                    </div>
                                                ))}
                                            {!snapshot?.runs.some(
                                                (run) =>
                                                    run.publicationId
                                                    === selectedProgram.latestPublication?.id,
                                            ) ? (
                                                <p className="text-sm text-alloy-midnight/45">No deliveries yet.</p>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
