"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  SERVICE_BRIEF_CONFIGS,
  type BriefResponses,
  type MenuItem,
  type CartSide,
} from "./types";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ReferenceUploader, type ReferenceItem } from "./ReferenceUploader";
import { SingleImageUploader } from "./SingleImageUploader";
import { BoxReferenceBuilder } from "./BoxReferenceBuilder";
import { CartReferenceBuilder } from "./CartReferenceBuilder";
import { KopiMenuBuilder } from "./KopiMenuBuilder";
import type { BoxReference, CartReference, KopiMenuItem } from "./types";

interface ServiceBriefFormProps {
  serviceCode: string;
  serviceName: string;
  projectId: string;
  clientToken?: string;
  onSubmit: (responses: BriefResponses, attachmentIds: string[]) => Promise<void>;
  isSubmitting?: boolean;
}

export function ServiceBriefForm({
  serviceCode,
  serviceName,
  projectId,
  clientToken,
  onSubmit,
  isSubmitting = false,
}: ServiceBriefFormProps) {
  const config = SERVICE_BRIEF_CONFIGS.find((c) => c.code === serviceCode);
  const [formData, setFormData] = useState<BriefResponses>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([{ id: "1", name: "", price: "" }]);
  const [cartSides, setCartSides] = useState<CartSide[]>([
    { sideName: "Sisi Depan Gerobak", dimensions: "100 × 80 cm", textBrief: "", imageBrief: "" },
    { sideName: "Sisi Kanan Gerobak", dimensions: "60 × 80 cm", textBrief: "", imageBrief: "" },
    { sideName: "Sisi Kiri Gerobak", dimensions: "60 × 80 cm", textBrief: "", imageBrief: "" },
  ]);
  const [referenceItems, setReferenceItems] = useState<ReferenceItem[]>([]);
  const [boxReferences, setBoxReferences] = useState<BoxReference[]>([]);
  const [cartReferences, setCartReferences] = useState<CartReference[]>([]);
  const [kopiMenuItems, setKopiMenuItems] = useState<KopiMenuItem[]>([{ id: "1", name: "", price: "" }]);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string>();
  const [brandLogoFile, setBrandLogoFile] = useState<File>();
  const [vendorLogoUrl, setVendorLogoUrl] = useState<string>();
  const [vendorLogoFile, setVendorLogoFile] = useState<File>();

  const updateField = (field: keyof BriefResponses, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  async function uploadFile(file: File, category: string): Promise<{ attachmentId: string; publicUrl: string } | null> {
    const uploadUrl = clientToken
      ? `/api/client-links/${clientToken}/upload`
      : "/api/upload";

    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", projectId);
    fd.append("category", category);

    const res = await fetch(uploadUrl, { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json();
      console.error("Upload failed:", data.error);
      return null;
    }
    return res.json();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Upload local image files first, then update state
    const localImageItems = referenceItems.filter(
      (item) => item.type === "image" && item.file
    );
    const uploadedItems: ReferenceItem[] = [];

    for (const item of localImageItems) {
      try {
        const formData = new FormData();
        formData.append("file", item.file!);
        formData.append("projectId", projectId);
        formData.append("category", "brief-reference");

        const uploadUrl = clientToken
          ? `/api/client-links/${clientToken}/upload`
          : "/api/upload";

        const res = await fetch(uploadUrl, { method: "POST", body: formData });

        if (!res.ok) {
          console.error("Upload failed for:", item.filename);
          continue;
        }

        const { attachmentId, publicUrl } = await res.json();
        uploadedItems.push({
          ...item,
          id: attachmentId,
          url: publicUrl,
          file: undefined,
        });
      } catch (err) {
        console.error("Upload error:", err);
      }
    }

    // Combine uploaded items with URL items
    const urlItems = referenceItems.filter(
      (item) => item.type === "url" && item.url
    );
    const allItems = [...uploadedItems, ...urlItems];

    // Clean up local blob URLs from referenceItems
    referenceItems
      .filter((item) => item.type === "image" && item.url.startsWith("blob:"))
      .forEach((item) => URL.revokeObjectURL(item.url));

    // Upload box reference files
    const uploadedBoxRefs: typeof boxReferences = [];
    for (const item of boxReferences) {
      if (item.file) {
        const uploaded = await uploadFile(item.file, "brief-box-reference");
        if (uploaded) {
          uploadedBoxRefs.push({ ...item, imageUrl: uploaded.publicUrl, file: undefined });
        } else {
          uploadedBoxRefs.push(item);
        }
      } else if (item.imageUrl) {
        uploadedBoxRefs.push(item);
      }
    }

    // Upload cart reference files
    const uploadedCartRefs: typeof cartReferences = [];
    for (const item of cartReferences) {
      if (item.file) {
        const uploaded = await uploadFile(item.file, "brief-cart-reference");
        if (uploaded) {
          uploadedCartRefs.push({ ...item, imageUrl: uploaded.publicUrl, file: undefined });
        } else {
          uploadedCartRefs.push(item);
        }
      } else if (item.imageUrl) {
        uploadedCartRefs.push(item);
      }
    }

    // Clean up local blob URLs
    boxReferences
      .filter((item) => item.imageUrl?.startsWith("blob:"))
      .forEach((item) => { if (item.imageUrl) URL.revokeObjectURL(item.imageUrl); });
    cartReferences
      .filter((item) => item.imageUrl?.startsWith("blob:"))
      .forEach((item) => { if (item.imageUrl) URL.revokeObjectURL(item.imageUrl); });
    if (brandLogoUrl?.startsWith("blob:")) URL.revokeObjectURL(brandLogoUrl);
    if (vendorLogoUrl?.startsWith("blob:")) URL.revokeObjectURL(vendorLogoUrl);

    // Upload brand logo if pending file
    let finalBrandLogoUrl = brandLogoUrl;
    if (brandLogoFile) {
      const uploaded = await uploadFile(brandLogoFile, "brief-logo");
      if (uploaded) finalBrandLogoUrl = uploaded.publicUrl;
    }

    // Upload vendor logo if pending file
    let finalVendorLogoUrl = vendorLogoUrl;
    if (vendorLogoFile) {
      const uploaded = await uploadFile(vendorLogoFile, "brief-logo");
      if (uploaded) finalVendorLogoUrl = uploaded.publicUrl;
    }

    const responses: BriefResponses = { ...formData };

    // Brand logo URL for SVC-03/04/05 and SVC-11
    if ((serviceCode === "SVC-03" || serviceCode === "SVC-04" || serviceCode === "SVC-05") && finalBrandLogoUrl) {
      responses.brand_logo_url = finalBrandLogoUrl;
    }
    if (serviceCode === "SVC-11" && finalBrandLogoUrl) {
      responses.brand_logo_url = finalBrandLogoUrl;
    }

    // Menu items for SVC-03/04/05
    if (serviceCode === "SVC-03" || serviceCode === "SVC-04" || serviceCode === "SVC-05") {
      responses.menu_items_json = menuItems.filter((m) => m.name.trim());
    }

    // Cart sides for SVC-11
    if (serviceCode === "SVC-11") {
      responses.cart_sides_json = cartSides.filter((s) => s.textBrief.trim());
      responses.cart_references_json = uploadedCartRefs.filter((c) => c.imageUrl);
      responses.kopi_menu_items_json = kopiMenuItems.filter((k) => k.name.trim());
    }

    // Box references for SVC-07
    if (serviceCode === "SVC-07") {
      responses.box_references_json = uploadedBoxRefs.filter((b) => b.imageUrl || b.description);
    }

    // Vendor logo URL for SVC-09
    if (serviceCode === "SVC-09" && finalVendorLogoUrl) {
      responses.vendor_logo_url = finalVendorLogoUrl;
    }

    // Collect attachment IDs from uploaded image items
    const attachmentIds = uploadedItems.map((item) => item.id);

    // Add reference URLs to responses
    if (allItems.length > 0) {
      responses.reference_items_json = allItems.map((item) => ({
        id: item.id,
        type: item.type,
        url: item.url,
        caption: item.caption,
      }));
    }

    await onSubmit(responses, attachmentIds);
  };

  // Common style options
  const styleOptions = [
    { value: "modern", label: "Modern / Minimalis" },
    { value: "classic", label: "Klasik / Elegan" },
    { value: "playful", label: "Playful / Fun" },
    { value: "professional", label: "Professional / Corporate" },
    { value: "rustic", label: "Rustic / Vintage" },
    { value: "bold", label: "Bold / Statement" },
  ];

  // Logo color options
  const colorOptions = [
    { value: "warm", label: "Hangat (Merah, Oranye, Kuning)" },
    { value: "cool", label: "Sejuk (Biru, Hijau, Ungu)" },
    { value: "neutral", label: "Netral (Hitam, Putih, Abu-abu)" },
    { value: "earth", label: "Alam (Hijau, Coklat, Beige)" },
    { value: "luxury", label: "Luxury (Emas, Perak, Hitam)" },
    { value: "bright", label: "Cerah (Multi-warna)" },
  ];

  // Photobooth size options
  const photoboothOptions = [
    { value: "4R", label: "4R — Standar Strip / Grid Photo" },
    { value: "A3", label: "Newspaper A3 — Tema Koran Unik & Aesthetic" },
  ];

  // Sosmed platform options
  const sosmedPlatformOptions = [
    { value: "instagram", label: "Instagram (Feed + Story)" },
    { value: "facebook", label: "Facebook" },
    { value: "twitter", label: "Twitter / X" },
    { value: "tiktok", label: "TikTok" },
    { value: "all", label: "Semua Platform" },
  ];

  // Sosmed vibe options
  const sosmedVibeOptions = [
    { value: "professional", label: "Professional / Business" },
    { value: "casual", label: "Casual / Friendly" },
    { value: "playful", label: "Playful / Fun" },
    { value: "luxury", label: "Luxury / Premium" },
    { value: "minimal", label: "Minimalist" },
  ];

  // Sticker media options
  const stickerMediaOptions = [
    { value: "product", label: "Label Produk" },
    { value: "packaging", label: "Packaging" },
    { value: "promo", label: "Stiker Promo / Harga" },
    { value: "branding", label: "Branding / Logo Stiker" },
    { value: "other", label: "Lainnya" },
  ];

  // Sticker shape options
  const stickerShapeOptions = [
    { value: "circle", label: "Bulat" },
    { value: "square", label: "Kotak" },
    { value: "rectangle", label: "Persegi Panjang" },
    { value: "oval", label: "Oval / Lonjong" },
    { value: "custom", label: "Custom / Die-cut" },
  ];

  if (!config) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Service configuration not found for {serviceCode}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Service Header */}
      <Card>
        <CardHeader>
          <CardTitle>{serviceName}</CardTitle>
          <CardDescription>
            Lengkapi form brief di bawah sesuai kebutuhan project Anda
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Logo Forms (SVC-01, SVC-02) */}
      {(serviceCode === "SVC-01" || serviceCode === "SVC-02") && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informasi Brand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brand_name">
                  Nama Brand / Usaha <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="brand_name"
                  placeholder="Contoh: Kedai Kopi Nusantara"
                  value={formData.brand_name || ""}
                  onChange={(e) => updateField("brand_name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business_desc">
                  Bidang Usaha & Deskripsi Singkat <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="business_desc"
                  placeholder="Jelaskan tentang usaha Anda, produk/jasa yang ditawarkan, dan target market..."
                  value={formData.business_desc || ""}
                  onChange={(e) => updateField("business_desc", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="colors">
                  Warna Utama & Yang Dihindari <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.colors || ""}
                  onValueChange={(v) => { if (v) updateField("colors", v); }}
                  options={colorOptions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih warna utama" />
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagline">Slogan / Tagline (opsional)</Label>
                <Input
                  id="tagline"
                  placeholder="Contoh: Nikmatnya Kopi Nusantara"
                  value={formData.tagline || ""}
                  onChange={(e) => updateField("tagline", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Poster/Banner/Baliho Forms (SVC-03, SVC-04, SVC-05) */}
      {(serviceCode === "SVC-03" || serviceCode === "SVC-04" || serviceCode === "SVC-05") && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informasi Konten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="main_text">
                  Informasi Teks & Daftar Menu / Promosi <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="main_text"
                  placeholder="Tuliskan semua teks yang ingin ditampilkan di desain..."
                  value={formData.main_text || ""}
                  onChange={(e) => updateField("main_text", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="size">
                  Ukuran Desain / Media Cetak <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="size"
                  placeholder="Contoh: A3 (29.7 x 42 cm)"
                  value={formData.size || ""}
                  onChange={(e) => updateField("size", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="style">
                  Nuansa / Gaya Desain <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.style || ""}
                  onValueChange={(v) => { if (v) updateField("style", v); }}
                  options={styleOptions}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih nuansa desain" />
                  </SelectTrigger>
                  <SelectContent>
                    {styleOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Brand Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo Brand</CardTitle>
              <CardDescription>Upload logo brand Anda (opsional)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SingleImageUploader
                value={brandLogoUrl}
                onChange={setBrandLogoUrl}
                onFileChange={setBrandLogoFile}
                label="Logo Brand"
                helperText="Upload file logo brand untuk ditampilkan di desain"
                projectId={projectId}
                clientToken={clientToken}
                disabled={isSubmitting}
              />
            </CardContent>
          </Card>

          {/* Menu Items - Repeatable */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daftar Menu / Produk</CardTitle>
              <CardDescription>Tambahkan item yang ingin ditampilkan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {menuItems.map((item, idx) => (
                <div key={item.id} className="flex gap-2 items-start">
                  <Input
                    placeholder="Nama item"
                    value={item.name}
                    onChange={(e) => {
                      const updated = [...menuItems];
                      updated[idx].name = e.target.value;
                      setMenuItems(updated);
                    }}
                    className="flex-1"
                  />
                  <CurrencyInput
                    value={parseInt(item.price ?? "", 10) || 0}
                    onChange={(v) => {
                      const updated = [...menuItems];
                      updated[idx].price = String(v);
                      setMenuItems(updated);
                    }}
                    placeholder="Rp 0"
                  />
                  {menuItems.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMenuItems(menuItems.filter((_, i) => i !== idx))}
                      aria-label="Hapus menu item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMenuItems([...menuItems, { id: String(Date.now()), name: "", price: "" }])}
              >
                <Plus className="h-4 w-4 mr-2" />
                Tambah Item
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Packaging Pouch (SVC-06) */}
      {serviceCode === "SVC-06" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Kemasan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dimensions">
                Ukuran Detail Kemasan (P x L x T) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dimensions"
                placeholder="Contoh: 10 x 5 x 15 cm"
                value={formData.dimensions || ""}
                onChange={(e) => updateField("dimensions", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mandatory_info">
                Informasi Wajib pada Kemasan <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="mandatory_info"
                placeholder="Contoh: Nama produk, komposisi, BPOM, net weight, halal badge, dll"
                value={formData.mandatory_info || ""}
                onChange={(e) => updateField("mandatory_info", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color_concept">
                Konsep Warna Kemasan <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="color_concept"
                placeholder="Jelaskan konsep warna yang diinginkan..."
                value={formData.color_concept || ""}
                onChange={(e) => updateField("color_concept", e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Packaging Box (SVC-07) */}
      {serviceCode === "SVC-07" && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Packaging Box</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dimensions">
                Ukuran Box (P x L x T) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dimensions"
                placeholder="Contoh: 20 x 15 x 10 cm"
                value={formData.dimensions || ""}
                onChange={(e) => updateField("dimensions", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mandatory_info">
                Informasi Wajib pada Box <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="mandatory_info"
                placeholder="Contoh: Nama brand, alamat, kontak, komposisi"
                value={formData.mandatory_info || ""}
                onChange={(e) => updateField("mandatory_info", e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Box Reference Builder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referensi Visual Box</CardTitle>
            <CardDescription>Upload referensi box yang diinginkan</CardDescription>
          </CardHeader>
          <CardContent>
            <BoxReferenceBuilder
              items={boxReferences}
              onChange={setBoxReferences}
              projectId={projectId}
              clientToken={clientToken}
              disabled={isSubmitting}
            />
          </CardContent>
        </Card>
        </>
      )}

      {/* Sticker Label (SVC-08) */}
      {serviceCode === "SVC-08" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Stiker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sticker_shape">
                Bentuk & Ukuran Stiker <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.sticker_shape || ""}
                onValueChange={(v) => { if (v) updateField("sticker_shape", v); }}
                options={stickerShapeOptions}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih bentuk stiker" />
                </SelectTrigger>
                <SelectContent>
                  {stickerShapeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sticker_media">
                Penggunaan Pada Media Apa <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.sticker_media || ""}
                onValueChange={(v) => { if (v) updateField("sticker_media", v); }}
                options={stickerMediaOptions}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih penggunaan" />
                </SelectTrigger>
                <SelectContent>
                  {stickerMediaOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sticker_text">
                Teks / Informasi pada Label <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="sticker_text"
                placeholder="Tuliskan semua teks yang ingin ada di stiker..."
                value={formData.sticker_text || ""}
                onChange={(e) => updateField("sticker_text", e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Frame Photobooth (SVC-09) */}
      {serviceCode === "SVC-09" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Frame Photobooth</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photobooth_size">
                Ukuran Frame <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.photobooth_size || ""}
                onValueChange={(v) => { if (v) updateField("photobooth_size", v); }}
                options={photoboothOptions}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih ukuran" />
                </SelectTrigger>
                <SelectContent>
                  {photoboothOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor_name">
                Nama Vendor / Tempat <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor_name"
                placeholder="Contoh: Kedai Foto Indonesia"
                value={formData.vendor_name || ""}
                onChange={(e) => updateField("vendor_name", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event_theme">
                Tema Acara / Event <span className="text-destructive">*</span>
              </Label>
              <Input
                id="event_theme"
                placeholder="Contoh: Wedding, Ulang Tahun, Corporate Event"
                value={formData.event_theme || ""}
                onChange={(e) => updateField("event_theme", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Logo Vendor</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Upload logo vendor/tempat jika ada
              </p>
              <SingleImageUploader
                value={vendorLogoUrl}
                onChange={setVendorLogoUrl}
                onFileChange={setVendorLogoFile}
                label="Logo Vendor"
                helperText="Upload logo vendor atau tempat photobooth"
                projectId={projectId}
                clientToken={clientToken}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paket Social Media (SVC-10) */}
      {serviceCode === "SVC-10" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Social Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sosmed_platform">
                Platform & Kebutuhan Konten <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.sosmed_platform || ""}
                onValueChange={(v) => { if (v) updateField("sosmed_platform", v); }}
                options={sosmedPlatformOptions}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih platform" />
                </SelectTrigger>
                <SelectContent>
                  {sosmedPlatformOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sosmed_vibe">
                Gaya Visual & Tone of Voice <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.sosmed_vibe || ""}
                onValueChange={(v) => { if (v) updateField("sosmed_vibe", v); }}
                options={sosmedVibeOptions}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih vibe" />
                </SelectTrigger>
                <SelectContent>
                  {sosmedVibeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="main_text">
                Informasi Teks & Kebutuhan Konten <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="main_text"
                placeholder="Jelaskan kebutuhan konten, jenis posting, frekuensi, dll..."
                value={formData.main_text || ""}
                onChange={(e) => updateField("main_text", e.target.value)}
                required
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paket Brand Kopi Keliling (SVC-11) */}
      {serviceCode === "SVC-11" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informasi Brand</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brand_name">
                  Nama Brand / Usaha <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="brand_name"
                  placeholder="Contoh: Kopi Keliling Nusantara"
                  value={formData.brand_name || ""}
                  onChange={(e) => updateField("brand_name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="main_text">
                  Deskripsi Menu Utama <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="main_text"
                  placeholder="Jelaskan tentang konsep dan menu utama..."
                  value={formData.main_text || ""}
                  onChange={(e) => updateField("main_text", e.target.value)}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Cart Sides - BRD Section 11.11 Cart Side Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Konfigurasi Gerobak</CardTitle>
              <CardDescription>Configure sisi-sisi gerobak</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartSides.map((side, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-medium">{side.sideName}</Label>
                    <span className="text-sm text-muted-foreground">{side.dimensions}</span>
                  </div>
                  <Textarea
                    placeholder={`Brief untuk ${side.sideName}...`}
                    value={side.textBrief}
                    onChange={(e) => {
                      const updated = [...cartSides];
                      updated[idx].textBrief = e.target.value;
                      setCartSides(updated);
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Brand Logo for SVC-11 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo Brand</CardTitle>
              <CardDescription>Upload logo brand Anda (opsional)</CardDescription>
            </CardHeader>
            <CardContent>
              <SingleImageUploader
                value={brandLogoUrl}
                onChange={setBrandLogoUrl}
                onFileChange={setBrandLogoFile}
                label="Logo Brand"
                helperText="Upload file logo brand untuk ditampilkan di desain gerobak"
                projectId={projectId}
                clientToken={clientToken}
                disabled={isSubmitting}
              />
            </CardContent>
          </Card>

          {/* Cart Reference Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Referensi Visual Gerobak</CardTitle>
              <CardDescription>Upload referensi gerobak kopi keliling yang diinginkan</CardDescription>
            </CardHeader>
            <CardContent>
              <CartReferenceBuilder
                items={cartReferences}
                onChange={setCartReferences}
                projectId={projectId}
                clientToken={clientToken}
                disabled={isSubmitting}
              />
            </CardContent>
          </Card>

          {/* Kopi Menu Items Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daftar Menu Kopi</CardTitle>
              <CardDescription>Tambahkan item menu kopi yang akan ditampilkan di gerobak</CardDescription>
            </CardHeader>
            <CardContent>
              <KopiMenuBuilder
                items={kopiMenuItems}
                onChange={setKopiMenuItems}
                disabled={isSubmitting}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Reference Images */}
      <ReferenceUploader
        items={referenceItems}
        onChange={setReferenceItems}
        maxItems={10}
        label="Referensi Visual"
        helperText="Upload gambar atau tambahkan link referensi (Pinterest, website, dll) sebagai inspirasi desain"
        disabled={isSubmitting}
      />

      {/* Submit Button */}
      <div className="flex justify-end gap-3 pt-4">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Mengirim...
            </>
          ) : (
            "Kirim Brief"
          )}
        </Button>
      </div>
    </form>
  );
}
