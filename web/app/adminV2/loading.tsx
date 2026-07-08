import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

/**
 * Streaming fallback while AdminV2 layout resolves auth + server bootstrap.
 * Structure matches workspace-v2 shell geometry to avoid blank first paint.
 */
export default function AdminV2Loading() {
    return <AlloyOperationalBootShell variant="workspace" />;
}
