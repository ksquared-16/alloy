import { redirect } from "next/navigation";
import { Poppins } from "next/font/google";

import { getAdminAuth } from "@/lib/adminAuth";
import AdminV2RootAuthProvider from "./AdminV2RootAuthProvider";
import AdminV2Shell from "./components/AdminV2Shell";
import "./adminV2.css";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins-adminv2",
  display: "swap",
});

export const dynamic = "force-dynamic";

export default async function AdminV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAdminAuth();

  if (!auth?.user?.id || !auth.role) {
    redirect("/unauthorized");
  }

  const userEmail =
    typeof auth.user.email === "string" && auth.user.email.trim() ? auth.user.email.trim() : "Unknown";

  return (
    <div className={poppins.variable} style={{ fontFamily: "var(--font-poppins-adminv2), system-ui, sans-serif" }}>
      <AdminV2RootAuthProvider
        userEmail={userEmail}
        userId={auth.user.id}
        orgId={typeof auth.orgId === "string" ? auth.orgId : ""}
        role={auth.role}
        roleKeys={auth.roleKeys ?? []}
      >
        <AdminV2Shell>{children}</AdminV2Shell>
      </AdminV2RootAuthProvider>
    </div>
  );
}
