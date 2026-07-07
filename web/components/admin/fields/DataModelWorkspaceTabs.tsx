"use client";

export type DataModelWorkspaceTab = "overview" | "relationships" | "fields" | "computed_signals";

type Props = {
    activeTab: DataModelWorkspaceTab;
    onSelect: (tab: DataModelWorkspaceTab) => void;
};

const TABS: { id: DataModelWorkspaceTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "relationships", label: "Relationships" },
    { id: "fields", label: "Fields" },
    { id: "computed_signals", label: "Computed Signals" },
];

export default function DataModelWorkspaceTabs({ activeTab, onSelect }: Props) {
    return (
        <div
            className="flex flex-wrap gap-1 border-b border-alloy-forge/10"
            role="tablist"
            data-testid="data-model-workspace-tabs"
        >
            {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onSelect(tab.id)}
                        className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                            active
                                ? "border-alloy-pine text-alloy-pine"
                                : "border-transparent text-alloy-midnight/55 hover:text-alloy-midnight"
                        }`}
                        data-workspace-tab={tab.id}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}

export { TABS as DATA_MODEL_WORKSPACE_TABS };
