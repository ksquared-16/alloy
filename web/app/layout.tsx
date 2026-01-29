import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import GhlScript from "@/components/GhlScript";
import StagingBanner from "@/components/StagingBanner";
import { QuoteModalProvider } from "@/lib/quoteModal";
import ConditionalSiteLayout from "@/components/ConditionalSiteLayout";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Alloy | Trusted Home Services in Bend",
  description: "Alloy connects homeowners with vetted local pros, starting with home cleaning in Bend, Oregon.",
  icons: {
    icon: "/brand/alloy-brandmark-blue.svg",
    apple: "/brand/alloy-brandmark-blue.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${poppins.variable} font-sans antialiased`}>
        <GhlScript />
        <StagingBanner />
        <QuoteModalProvider>
          <ConditionalSiteLayout>{children}</ConditionalSiteLayout>
        </QuoteModalProvider>
      </body>
    </html>
  );
}
