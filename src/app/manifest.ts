import type { MetadataRoute } from "next";
import { getStudioSettings } from "@/lib/studio";

// Manifest PWA (docs/OWNER_NOTIFICATIONS_INBOX.md §2): supaya portal bisa dipasang di Layar Utama dan web push
// jalan di iPhone. Ikon memakai logo studio dari Settings › General; tanpa logo, favicon.
export const dynamic = "force-dynamic";

const typeOf = (url: string) =>
  /\.svg(\?|$)/i.test(url) ? "image/svg+xml" : /\.png(\?|$)/i.test(url) ? "image/png" : /\.jpe?g(\?|$)/i.test(url) ? "image/jpeg" : undefined;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const studio = await getStudioSettings().catch(() => null);
  const name = studio?.name ?? "YukDesain Studio";
  const logo = studio?.logoUrl?.trim();
  return {
    name: `${name} Portal`,
    short_name: name,
    description: "Portal order, project, dan bot WhatsApp",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: logo
      ? [
          { src: logo, sizes: "any", type: typeOf(logo), purpose: "any" },
          { src: logo, sizes: "512x512", type: typeOf(logo), purpose: "maskable" },
        ]
      : [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
