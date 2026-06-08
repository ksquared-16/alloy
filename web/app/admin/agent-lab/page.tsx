import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/adminAuth";
import AgentConfigLabClient from "@/components/admin/agentLab/AgentConfigLabClient";

export const dynamic = "force-dynamic";

function agentConfigLabEnabled(): boolean {
    const v = process.env.AGENT_CONFIG_LAB_ENABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

/**
 * Internal testing harness for agent config POST routes (queue v0, record overview layout v1).
 * Requires admin role + AGENT_CONFIG_LAB_ENABLED.
 */
export default async function AgentConfigLabPage() {
    const auth = await getAdminAuth();
    if (!auth?.user?.id || !auth.role) {
        redirect("/unauthorized");
    }
    if (auth.role !== "admin") {
        redirect("/unauthorized");
    }
    if (!agentConfigLabEnabled()) {
        redirect("/admin/dashboard");
    }

    return <AgentConfigLabClient />;
}
