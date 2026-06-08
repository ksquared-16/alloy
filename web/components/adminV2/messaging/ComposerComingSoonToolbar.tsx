"use client";

import ComposerFormattingToolbar from "@/components/adminV2/messaging/ComposerFormattingToolbar";
import ComposerReplyActionCluster from "@/components/adminV2/messaging/ComposerReplyActionCluster";

type ComposerComingSoonToolbarProps = {
    compact?: boolean;
    className?: string;
    showActions?: boolean;
};

/** Back-compat wrapper — formatting toolbar; use ComposerReplyActionCluster for send row. */
export default function ComposerComingSoonToolbar({
    compact = false,
    className = "",
    showActions = false,
}: ComposerComingSoonToolbarProps) {
    return (
        <div className={className}>
            <ComposerFormattingToolbar compact={compact} />
            {showActions ? (
                <ComposerReplyActionCluster compact sendDisabled />
            ) : null}
        </div>
    );
}
