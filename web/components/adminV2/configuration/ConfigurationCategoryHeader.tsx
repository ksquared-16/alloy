"use client";

type Props = {
    label: string;
    testId?: string;
};

/** Bend Pine category rail — business grouping language for Configuration workspaces. */
export default function ConfigurationCategoryHeader({ label, testId }: Props) {
    return (
        <h2
            className="mb-1 flex items-center gap-2 px-0.5 text-[11px] font-semibold text-alloy-midnight/55"
            data-testid={testId}
        >
            <span className="h-3 w-0.5 shrink-0 rounded-full bg-alloy-bend-pine" aria-hidden />
            {label}
        </h2>
    );
}
