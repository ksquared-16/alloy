import { Poppins } from "next/font/google";

/**
 * Isolated layout for the Layout V2 proof page.
 *
 * This lives in a route group (`(proof)`) so the URL is `/adminV2/layout-proof`
 * WITHOUT inheriting `app/adminV2/layout.tsx` (which mounts AdminV2Shell — the
 * live AdminV2 runtime). The proof is therefore fully decoupled from AdminV2
 * runtime behavior while still using the AdminV2 visual language (Poppins +
 * neutral surface). No shell, sidebar, command bar, canvas, or VM code mounts.
 */

const poppins = Poppins({
    weight: ["400", "500", "600", "700"],
    subsets: ["latin"],
    variable: "--font-poppins-adminv2",
    display: "swap",
});

export const dynamic = "force-dynamic";

export default function LayoutProofLayout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={poppins.variable}
            style={{
                fontFamily: "var(--font-poppins-adminv2), system-ui, sans-serif",
                minHeight: "100vh",
                backgroundColor: "#f6f8fb",
            }}
        >
            {children}
        </div>
    );
}
