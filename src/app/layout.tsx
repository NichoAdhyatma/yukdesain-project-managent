import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast";
import { getStudioSettings } from "@/lib/studio";
import { STUDIO_DEFAULTS } from "@/lib/constants";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const studio = await getStudioSettings().catch(() => null);
  const name = studio?.name ?? STUDIO_DEFAULTS.name;
  const tagline = studio?.tagline ?? STUDIO_DEFAULTS.tagline;
  return {
    title: `${name} Portal`,
    description: `Management system for ${tagline}`,
    icons: {
      icon: "/favicon.ico",
    },
  };
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full">
      <body className={`${poppins.variable} font-sans h-full antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
        <ToastContainer />
      </body>
    </html>
  );
}
