import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.STORAGE_BUCKET!;
const ENDPOINT = process.env.STORAGE_ENDPOINT!;
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY!;
const SECRET_KEY = process.env.STORAGE_SECRET_KEY!;
const PUBLIC_URL_BASE = process.env.STORAGE_PUBLIC_URL_BASE!;

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: ENDPOINT,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
}

function buildKey(category: string, projectId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${category}/${projectId}/${Date.now()}-${safeName}`;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = (formData.get("projectId") as string) || "";
    const category = (formData.get("category") as string) || "progress";
    const categoryMap: Record<string, "CLIENT_ASSET" | "BRIEF_REFERENCE" | "LOGO" | "PROGRESS" | "FINAL" | "REVISION" | "INVOICE"> = {
      progress: "PROGRESS",
      final: "FINAL",
      revision: "REVISION",
      logo: "LOGO",
      "brief-logo": "LOGO",
      "brief-reference": "BRIEF_REFERENCE",
      "brief-box-reference": "BRIEF_REFERENCE",
      "brief-cart-reference": "BRIEF_REFERENCE",
      "client-asset": "CLIENT_ASSET",
      invoice: "INVOICE",
    };
    const mappedCategory = categoryMap[category] || "CLIENT_ASSET";
    const updateId = formData.get("updateId") as string | undefined;
    const revisionId = formData.get("revisionId") as string | undefined;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large" }, { status: 400 });

    // Handle temp projectId - skip projectId in DB if not provided
    const effectiveProjectId = projectId && projectId !== "temp" ? projectId : undefined;

    const storageKey = buildKey(category, effectiveProjectId || "unknown", file.name);
    const client = getClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    await client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: file.type,
      Body: buffer,
    }));

    const attachment = await prisma.attachment.create({
      data: {
        filename: file.name,
        mimeType: file.type,
        size: buffer.length,
        storageKey,
        uploaderId: "system",
        category: mappedCategory,
        projectId: effectiveProjectId,
        updateId,
        revisionId,
      },
    });

    const publicUrl = `${PUBLIC_URL_BASE}/${storageKey}`;

    return NextResponse.json({ attachmentId: attachment.id, publicUrl, storageKey });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
