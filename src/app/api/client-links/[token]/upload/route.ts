import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.STORAGE_BUCKET!;
const ENDPOINT = process.env.STORAGE_ENDPOINT!;
const ACCESS_KEY = process.env.STORAGE_ACCESS_KEY!;
const SECRET_KEY = process.env.STORAGE_SECRET_KEY!;
const PUBLIC_URL_BASE = process.env.STORAGE_PUBLIC_URL_BASE!;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await prisma.clientLink.findUnique({ where: { token } });
    if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });
    // Allow upload if link is ACTIVE or LOCKED (brief already submitted — can still add attachments)
    if (link.status !== "ACTIVE" && link.status !== "LOCKED") {
      return NextResponse.json({ error: "Link is no longer usable" }, { status: 410 });
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return NextResponse.json({ error: "Link has expired" }, { status: 410 });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;
    const category = (formData.get("category") as string) || "brief-reference";
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

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large" }, { status: 400 });

    console.log("[client-upload] Uploading file:", file.name, "size:", file.size, "type:", file.type);
    console.log("[client-upload] category:", category, "mappedCategory:", mappedCategory, "projectId:", projectId);

    const storageKey = buildKey(category, projectId, file.name);
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
        uploaderId: "anonymous",
        projectId,
        category: mappedCategory,
      },
    });

    const publicUrl = `${PUBLIC_URL_BASE}/${storageKey}`;
    console.log("[client-upload] Success:", publicUrl);

    return NextResponse.json({ attachmentId: attachment.id, publicUrl, storageKey });
  } catch (error) {
    console.error("[client-upload] Error:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
