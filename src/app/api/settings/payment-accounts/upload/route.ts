import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getClient } from "@/lib/storage";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string || "logo";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, SVG" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Max 10MB" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const category = "payment-logo";
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop() || "png";
    const storageKey = `${category}/${type}/${timestamp}.${ext}`;

    const client = getClient();
    const command = new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET!,
      Key: storageKey,
      Body: buffer,
      ContentType: file.type,
    });

    await client.send(command);

    const publicUrl = `${process.env.STORAGE_PUBLIC_URL_BASE}/${storageKey}`;
    return NextResponse.json({ publicUrl });
  } catch (error) {
    console.error("Error uploading payment logo:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
