import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

/**
 * Streaming fallback for the AdminV2 workspace subtree. The parent layout has already resolved auth
 * and rendered AdminV2Shell around this slot, so this fallback fills the shell's `{children}` area —
 * it must NOT paint its own sidebar/top-nav chrome (that duplicated the midnight-blue rail + header
 * inside the content area, Kelly A1). Content mode paints a centered Alloy loader (Kelly A5).
 */
export default function AdminV2Loading() {
    return <AlloyOperationalBootShell variant="workspace" chrome="content" />;
}
