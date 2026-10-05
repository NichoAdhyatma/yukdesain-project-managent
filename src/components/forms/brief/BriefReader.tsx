"use client";

import { SERVICE_BRIEF_CONFIGS } from "./types";
import { ExternalLink, FileText } from "lucide-react";

type BriefResponseItem = { questionId: string; question: string; answer: string };

interface BriefReaderProps {
  responses: BriefResponseItem[];
  serviceCode: string;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function isJsonString(str: string): boolean {
  try {
    const val = JSON.parse(str);
    return typeof val === "object" && val !== null;
  } catch {
    return false;
  }
}

function ImageField({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="relative w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={label}
          className="max-w-[200px] max-h-[200px] object-contain rounded-lg border bg-muted/50"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        Buka di tab baru
      </a>
    </div>
  );
}

function JsonTableField({ label, data }: { label: string; data: unknown }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  // Menu items
  if (data[0] && "name" in data[0] && "price" in data[0]) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nama</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Harga</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item: { id: string; name: string; price?: string }, idx: number) => (
                <tr key={item.id || idx} className="border-t">
                  <td className="px-3 py-2">{item.name || "-"}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {item.price ? formatCurrency(parseInt(item.price, 10) || 0) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Cart sides
  if (data[0] && "sideName" in data[0]) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sisi</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ukuran</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Deskripsi</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item: { sideName: string; dimensions: string; textBrief: string }, idx: number) => (
                <tr key={idx} className="border-t">
                  <td className="px-3 py-2">{item.sideName}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.dimensions}</td>
                  <td className="px-3 py-2">{item.textBrief || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Cart references / box references
  if (data[0] && ("imageUrl" in data[0] || "description" in data[0])) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.map((item: { id?: string; imageUrl?: string; description?: string }, idx: number) =>
            item.imageUrl ? (
              <div key={item.id || idx} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.description || `Referensi ${idx + 1}`}
                  className="w-full h-32 object-cover rounded-lg border"
                />
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
            ) : item.description ? (
              <div key={item.id || idx} className="rounded-lg border p-2 text-xs text-muted-foreground">
                {item.description}
              </div>
            ) : null
          )}
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="text-xs bg-muted/50 rounded-lg p-2 overflow-auto max-h-48">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function ImageGalleryField({ label, data }: { label: string; data: unknown }) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const urls = data
    .map((item: { type?: string; imageUrl?: string; url?: string }) => {
      if (item.type === "image" && item.imageUrl) return item.imageUrl;
      if (item.url) return item.url;
      return null;
    })
    .filter(Boolean) as string[];

  if (urls.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {urls.map((url, idx) => (
          <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Referensi ${idx + 1}`}
              className="w-full h-28 object-cover rounded-lg border hover:border-primary transition-colors cursor-pointer"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

// Map questionId to human-readable label
const FIELD_LABELS: Record<string, string> = {
  brand_name: "Nama Brand / Usaha",
  tagline: "Tagline",
  business_desc: "Deskripsi Bisnis",
  colors: "Warna yang Diinginkan",
  main_text: "Teks Utama",
  size: "Ukuran",
  style: "Gaya / Style",
  dimensions: "Dimensi",
  mandatory_info: "Informasi Wajib",
  color_concept: "Konsep Warna",
  sticker_shape: "Bentuk Sticker",
  sticker_media: "Media Cetak",
  sticker_text: "Teks Sticker",
  photobooth_size: "Ukuran Fotobooth",
  vendor_name: "Nama Vendor / Tempat",
  event_theme: "Tema Acara",
  sosmed_platform: "Platform Social Media",
  sosmed_vibe: "Vibe / Gaya",
};

function getLabel(questionId: string): string {
  return FIELD_LABELS[questionId] || questionId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isImageUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const ext = url.pathname.toLowerCase();
    return /\.(jpg|jpeg|png|gif|webp|svg)$/.test(ext) || value.includes("r2.dev") || value.includes("cloudflarestream") || value.includes("imgix");
  } catch {
    return false;
  }
}

export function BriefReader({ responses, serviceCode }: BriefReaderProps) {
  const config = SERVICE_BRIEF_CONFIGS.find((c) => c.code === serviceCode);

  if (!responses || responses.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Tidak ada data brief</p>
      </div>
    );
  }

  // Separate special fields from regular fields
  const regularFields: BriefResponseItem[] = [];
  const logoFields: Array<{ label: string; value: string }> = [];
  const jsonFields: Array<{ label: string; data: unknown }> = [];
  const imageGalleryFields: Array<{ label: string; data: unknown }> = [];

  for (const r of responses) {
    const { questionId, answer } = r;
    if (!answer) continue;

    // Logo/image URL fields
    if (questionId === "brand_logo_url" || questionId === "vendor_logo_url") {
      const label = questionId === "brand_logo_url" ? "Logo Brand" : "Logo Vendor";
      logoFields.push({ label, value: answer });
      continue;
    }

    // Reference items JSON
    if (questionId === "reference_items_json") {
      const parsed = JSON.parse(answer);
      imageGalleryFields.push({ label: "Referensi Gambar", data: parsed });
      continue;
    }

    // Other JSON fields (menu items, cart sides, etc.)
    if (
      questionId.endsWith("_json") &&
      isJsonString(answer)
    ) {
      const parsed = JSON.parse(answer);
      const label = getLabel(questionId.replace("_json", ""));
      jsonFields.push({ label, data: parsed });
      continue;
    }

    // Image URL in answer
    if (isImageUrl(answer)) {
      const label = getLabel(questionId);
      imageGalleryFields.push({
        label,
        data: [{ imageUrl: answer }],
      });
      continue;
    }

    regularFields.push({ ...r, answer });
  }

  return (
    <div className="space-y-6">
      {/* Logo / Image Fields */}
      {logoFields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {logoFields.map((f) => (
            <ImageField key={f.label} label={f.label} url={f.value} />
          ))}
        </div>
      )}

      {/* JSON Fields (menu items, cart sides, etc.) */}
      {jsonFields.map((f) => (
        <JsonTableField key={f.label} label={f.label} data={f.data} />
      ))}

      {/* Image Gallery */}
      {imageGalleryFields.map((f) => (
        <ImageGalleryField key={f.label} label={f.label} data={f.data} />
      ))}

      {/* Regular Text Fields */}
      {regularFields.length > 0 && (
        <div className="space-y-3">
          {regularFields.map((r) => (
            <div key={r.questionId} className="rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {r.question || getLabel(r.questionId)}
              </p>
              <p className="text-sm whitespace-pre-wrap break-words">
                {r.answer}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Service Info */}
      {config && (
        <div className="rounded-lg border border-dashed p-3 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">Layanan:</span> {config.name} ({config.code})
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-medium">Field yang diperlukan:</span>{" "}
            {[
              ...(config.requiredFields || []),
              ...(config.optionalFields || []),
            ]
              .map((f) => getLabel(f))
              .join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
