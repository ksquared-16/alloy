import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy URL: user/role/access management now lives under Users & Roles. */
export default function UserAccessSettingsRedirectPage() {
    redirect("/adminV2/settings/users-roles");
}
