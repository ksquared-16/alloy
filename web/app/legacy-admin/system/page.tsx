import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy system hub — superseded by Platform Configuration at /settings. */
export default function AdminSystemHubRedirectPage() {
    redirect("/settings");
}
