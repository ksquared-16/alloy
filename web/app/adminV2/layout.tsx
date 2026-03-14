import { Poppins } from "next/font/google";
import AdminV2Shell from "./components/AdminV2Shell";
import "./adminV2.css";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins-adminv2",
  display: "swap",
});

export default function AdminV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={poppins.variable} style={{ fontFamily: "var(--font-poppins-adminv2), system-ui, sans-serif" }}>
      <AdminV2Shell>{children}</AdminV2Shell>
    </div>
  );
}
