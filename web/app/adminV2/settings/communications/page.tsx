import CommunicationsSetupClient from "@/app/adminV2/settings/communications/CommunicationsSetupClient";

export const dynamic = "force-dynamic";

export default function CommunicationsSetupSettingsPage() {
    return (
        <div className="w-full min-w-0 space-y-3">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Communications setup</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Org-scoped email/SMS provider bindings — status and safe edits only. Secrets stay in{" "}
                    <code className="rounded bg-alloy-midnight/5 px-1 py-0.5 text-[10px]">secret_ref</code> / env; never shown here.
                </p>
            </header>
            <CommunicationsSetupClient />
        </div>
    );
}
