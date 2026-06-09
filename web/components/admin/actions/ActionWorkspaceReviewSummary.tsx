"use client";

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";

type Props = {
    fields: readonly ActionWorkspaceGatherField[];
    values: Record<string, string>;
    dataTestIdPrefix?: string;
};

export function ActionWorkspaceReviewSummary({
    fields,
    values,
    dataTestIdPrefix = "action-workspace-review",
}: Props) {
    const rows = fields
        .map((field) => ({
            field,
            value: (values[field.payload_key] ?? "").trim(),
        }))
        .filter((row) => row.value.length > 0);

    return (
        <div className="space-y-4" data-testid={`${dataTestIdPrefix}-summary`}>
            <p className="text-[13px] text-alloy-midnight/60">
                Read-only summary. Use Back to edit anything before creating.
            </p>
            {rows.length === 0 ?
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    No details entered yet.
                </p>
            :   <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-4 md:grid-cols-2">
                    {rows.map(({ field, value }) => (
                        <div
                            key={field.payload_key}
                            className={field.multiline ? "md:col-span-2" : undefined}
                            data-testid={`${dataTestIdPrefix}-row-${field.payload_key}`}
                        >
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                {field.field_label}
                            </dt>
                            <dd className="mt-0.5 text-sm font-medium text-alloy-midnight">{value}</dd>
                        </div>
                    ))}
                </dl>
            }
        </div>
    );
}
