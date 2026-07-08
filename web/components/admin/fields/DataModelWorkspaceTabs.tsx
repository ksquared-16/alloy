"use client";

export type DataModelWorkspaceTab = "overview" | "relationships" | "categories" | "fields";

type Props = {
    activeTab: DataModelWorkspaceTab;
    onSelect: (tab: DataModelWorkspaceTab) => void;
};

const TABS: { id: DataModelWorkspaceTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "relationships", label: "Relationships" },
    { id: "categories", label: "Categories" },
    { id: "fields", label: "Fields" },
];

export default function DataModelWorkspaceTabs({ activeTab, onSelect }: Props) {
    return (
        <div
            className="flex flex-wrap gap-0.5 border-b border-alloy-forge/10"
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
                        className={[
                            "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors",
                            active
                                ? "border-alloy-bend-pine text-alloy-bend-pine"
                                : "border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/80",
                        ].join(" ")}
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
