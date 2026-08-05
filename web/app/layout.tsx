import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import StagingBanner from "@/components/StagingBanner";
import { QuoteModalProvider } from "@/lib/quoteModal";
import ConditionalSiteLayout from "@/components/ConditionalSiteLayout";
import MetaPixel from "@/components/MetaPixel";

const poppins = Poppins({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: {
    default: "Where Work Happens",
    template: "%s | Alloy",
  },
  description:
    "Most software stores information. Alloy moves work forward — Business Processes, Processing, and Operational Intelligence in one operating system.",
  icons: {
    icon: "/marketing/favicon/alloy-gradient-brandmark.svg",
    apple: "/marketing/favicon/alloy-gradient-brandmark.svg",
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
        <MetaPixel />
        <StagingBanner />
        <QuoteModalProvider>
          <ConditionalSiteLayout>{children}</ConditionalSiteLayout>
        </QuoteModalProvider>
      </body>
    </html>
  );
}
