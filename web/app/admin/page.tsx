import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AdminClient userEmail={user.email || "Unknown"} />;
}

