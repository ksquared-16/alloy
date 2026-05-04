import UserAccessClient from "@/app/adminV2/settings/user-access/UserAccessClient";

export const dynamic = "force-dynamic";

export default function UserAccessSettingsPage() {
    return (
        <div className="w-full max-w-3xl space-y-3">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">User access scope</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Assign CRM data visibility per org member. Admin only.
                </p>
            </header>
            <UserAccessClient />
        </div>
    );
}
