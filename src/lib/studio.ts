import { prisma } from "@/lib/db";

export type StudioSettings = {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  logoUrl: string;
};

const DEFAULTS: StudioSettings = {
  name: "YukDesain Studio",
  tagline: "Creative Design Agency",
  email: "hello@yukdesain.com",
  phone: "",
  address: "Jakarta, Indonesia",
  logoUrl: "",
};

let _cached: StudioSettings | null = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

export async function getStudioSettings(): Promise<StudioSettings> {
  const now = Date.now();
  if (_cached && now - _cacheTime < CACHE_TTL) {
    return _cached;
  }

  const db = await prisma.studioSettings.findUnique({
    where: { id: "default" },
  });

  _cached = db
    ? {
        name: db.name,
        tagline: db.tagline,
        email: db.email,
        phone: db.phone,
        address: db.address,
        logoUrl: db.logoUrl,
      }
    : DEFAULTS;
  _cacheTime = now;
  return _cached;
}

export function invalidateStudioCache() {
  _cached = null;
  _cacheTime = 0;
}
