"use client";

/**
 * Communications child-section tabs — delegates to WorkspaceSubTabs (doctrine primitive).
 * Retained for contract tests that grep this module path.
 */
import WorkspaceSubTabs from "@/components/workspace/operational/WorkspaceSubTabs";

export default function CommsModalTabBar<K extends string>(props: {
    tabs: { key: K; label: string }[];
    activeKey: K;
    onSelect: (key: K) => void;
    "aria-label"?: string;
}) {
    return (
        <div data-comms-modal-tabs="true">
            <WorkspaceSubTabs
            tabs={props.tabs}
            activeKey={props.activeKey}
            onSelect={props.onSelect}
            ariaLabel={props["aria-label"]}
            dataAttr="comms"
        />
        </div>
    );
}
