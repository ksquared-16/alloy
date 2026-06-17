"use client";

type QuickStartAction = "template" | "kpi_strip" | "contact_summary" | "children_list";

type Props = {
    onQuickStart: (action: QuickStartAction) => void;
};

const QUICK_STARTS: { action: QuickStartAction; label: string; description: string; testId: string }[] = [
    {
        action: "template",
        label: "Starter layout",
        description: "A balanced default drawer to customize.",
        testId: "layout-builder-start-template",
    },
    {
        action: "kpi_strip",
        label: "KPI tiles row",
        description: "Tour, follow-ups, and enrollment highlights.",
        testId: "layout-builder-start-kpi",
    },
    {
        action: "contact_summary",
        label: "Contact card",
        description: "Household and primary contact fields.",
        testId: "layout-builder-start-contact",
    },
    {
        action: "children_list",
        label: "Children list",
        description: "Enrollment rows with child details.",
        testId: "layout-builder-start-children",
    },
];

export default function LayoutBuilderCanvasStartGuide({ onQuickStart }: Props) {
    return (
        <div
            className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-alloy-stone/25 via-alloy-stone/5 to-transparent p-4 sm:items-center"
            data-testid="layout-builder-canvas-start-guide"
        >
            <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-alloy-forge/10 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
                <h4 className="text-sm font-semibold text-alloy-midnight">Start building your drawer</h4>
                <p className="mt-1 text-xs leading-relaxed text-alloy-midnight/55">
                    Click <strong>+ Add card</strong> on the left, or pick a quick start below. Click anything on the canvas to edit it.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {QUICK_STARTS.map((item) => (
                        <button
                            key={item.action}
                            type="button"
                            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] px-3 py-2.5 text-left transition hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.04]"
                            onClick={() => onQuickStart(item.action)}
                            data-testid={item.testId}
                        >
                            <span className="block text-xs font-semibold text-alloy-midnight">{item.label}</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-alloy-midnight/50">
                                {item.description}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
