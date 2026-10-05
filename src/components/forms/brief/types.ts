// Canonical brief response keys per BRD Section 14
export interface BriefResponses {
  // Common fields
  brand_name?: string;
  tagline?: string;
  business_desc?: string;
  colors?: string;
  main_text?: string;
  size?: string;
  style?: string;
  dimensions?: string;
  mandatory_info?: string;
  color_concept?: string;

  // Sticker Label
  sticker_shape?: string;
  sticker_media?: string;
  sticker_text?: string;

  // Frame Photobooth
  photobooth_size?: string;
  vendor_name?: string;
  event_theme?: string;
  vendor_logo_url?: string;

  // Paket Sosial Media
  sosmed_platform?: string;
  sosmed_vibe?: string;

  // URLs
  brand_logo_url?: string;

  // JSON fields for repeatable data
  menu_items_json?: MenuItem[];
  box_references_json?: BoxReference[];
  cart_references_json?: CartReference[];
  cart_sides_json?: CartSide[];
  kopi_menu_items_json?: KopiMenuItem[];
  reference_items_json?: ReferenceItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  price?: string;
  image?: string;
  caption?: string;
}

export interface BoxReference {
  id: string;
  description: string;
  imageUrl?: string;
  file?: File; // local file for preview, uploaded on form submit
}

export interface CartReference {
  id: string;
  imageUrl?: string;
  description?: string;
  file?: File; // local file for preview, uploaded on form submit
}

export interface CartSide {
  sideName: string;
  dimensions: string;
  textBrief: string;
  imageBrief?: string;
}

export interface KopiMenuItem {
  id: string;
  name: string;
  price?: string;
  image?: string;
  caption?: string;
}

export interface ReferenceItem {
  id: string;
  type: "image" | "url";
  imageUrl?: string;
  url?: string;
  caption?: string;
}

// Service codes per BRD Section 10
export const SERVICE_CODES = {
  LOGO_MINIMALIS: "SVC-01",
  LOGO_ILUSTRASI: "SVC-02",
  POSTER_MENU: "SVC-03",
  BANNER_UMKM: "SVC-04",
  BALIHO_SPANDUK: "SVC-05",
  PACKAGING_POUCH: "SVC-06",
  PACKAGING_BOX: "SVC-07",
  STICKER_LABEL: "SVC-08",
  FRAME_PHOTBOOTH: "SVC-09",
  PAKET_SOSIAL_MEDIA: "SVC-10",
  PAKET_BRAND_KOPI: "SVC-11",
} as const;

// Service metadata
export interface ServiceBriefConfig {
  code: string;
  name: string;
  requiredFields: (keyof BriefResponses)[];
  optionalFields: (keyof BriefResponses)[];
  hasRepeatableItems?: boolean;
  repeatableItemType?: "menu_items" | "box_references" | "cart_references" | "cart_sides" | "kopi_menu_items" | "reference_items";
}

// Brief configs per service - BRD Section 11 & 13
export const SERVICE_BRIEF_CONFIGS: ServiceBriefConfig[] = [
  {
    code: SERVICE_CODES.LOGO_MINIMALIS,
    name: "Logo Minimalis",
    requiredFields: ["brand_name", "business_desc", "colors"],
    optionalFields: ["tagline", "reference_items_json"],
  },
  {
    code: SERVICE_CODES.LOGO_ILUSTRASI,
    name: "Logo Ilustrasi",
    requiredFields: ["brand_name", "business_desc", "colors"],
    optionalFields: ["tagline", "reference_items_json"],
  },
  {
    code: SERVICE_CODES.POSTER_MENU,
    name: "Poster Menu",
    requiredFields: ["main_text", "size", "style"],
    optionalFields: ["brand_logo_url", "menu_items_json"],
    hasRepeatableItems: true,
    repeatableItemType: "menu_items",
  },
  {
    code: SERVICE_CODES.BANNER_UMKM,
    name: "Banner UMKM",
    requiredFields: ["main_text", "size", "style"],
    optionalFields: ["brand_logo_url", "menu_items_json"],
    hasRepeatableItems: true,
    repeatableItemType: "menu_items",
  },
  {
    code: SERVICE_CODES.BALIHO_SPANDUK,
    name: "Baliho / Spanduk Ads",
    requiredFields: ["main_text", "size", "style"],
    optionalFields: ["brand_logo_url", "menu_items_json"],
    hasRepeatableItems: true,
    repeatableItemType: "menu_items",
  },
  {
    code: SERVICE_CODES.PACKAGING_POUCH,
    name: "Packaging Pouch",
    requiredFields: ["dimensions", "mandatory_info", "color_concept"],
    optionalFields: ["reference_items_json"],
  },
  {
    code: SERVICE_CODES.PACKAGING_BOX,
    name: "Packaging Box",
    requiredFields: ["dimensions", "mandatory_info"],
    optionalFields: ["box_references_json", "reference_items_json"],
    hasRepeatableItems: true,
    repeatableItemType: "box_references",
  },
  {
    code: SERVICE_CODES.STICKER_LABEL,
    name: "Sticker Label",
    requiredFields: ["sticker_shape", "sticker_media", "sticker_text"],
    optionalFields: ["reference_items_json"],
  },
  {
    code: SERVICE_CODES.FRAME_PHOTBOOTH,
    name: "Frame Photobooth 4R / A3",
    requiredFields: ["photobooth_size", "vendor_name", "event_theme"],
    optionalFields: ["vendor_logo_url", "reference_items_json"],
  },
  {
    code: SERVICE_CODES.PAKET_SOSIAL_MEDIA,
    name: "Paket Social Media",
    requiredFields: ["sosmed_platform", "sosmed_vibe", "main_text"],
    optionalFields: ["reference_items_json"],
  },
  {
    code: SERVICE_CODES.PAKET_BRAND_KOPI,
    name: "Paket Brand Kopi Keliling",
    requiredFields: ["brand_name", "main_text"],
    optionalFields: ["brand_logo_url", "cart_sides_json", "cart_references_json", "kopi_menu_items_json", "reference_items_json"],
    hasRepeatableItems: true,
    repeatableItemType: "cart_sides",
  },
];
