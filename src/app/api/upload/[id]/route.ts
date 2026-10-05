import { NextResponse } from "next/server";
import { deleteFile } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Find attachment
    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Only the uploader or an admin can delete
    if (attachment.uploaderId !== user.id && !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete from storage
    try {
      await deleteFile(attachment.storageKey);
    } catch (storageError) {
      // Log but continue — DB record should still be deleted
      console.error("Failed to delete file from storage:", storageError);
    }

    // Delete DB record
    await prisma.attachment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete attachment error:", error);
    return NextResponse.json({ error: "Failed to delete attachment" }, { status: 500 });
  }
}
