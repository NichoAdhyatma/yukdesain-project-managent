import { NextResponse } from "next/server";
import { deleteObject, deleteObjects } from "@/lib/r2";

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const keysParam = searchParams.get("keys");

    if (keysParam) {
      // Delete multiple files
      const keys = keysParam.split(",").filter(Boolean);
      if (keys.length === 0) {
        return NextResponse.json({ error: "No keys provided" }, { status: 400 });
      }
      await deleteObjects(keys);
      return NextResponse.json({ deleted: keys.length });
    } else if (key) {
      // Delete single file
      await deleteObject(key);
      return NextResponse.json({ deleted: 1 });
    } else {
      return NextResponse.json({ error: "Missing key or keys parameter" }, { status: 400 });
    }
  } catch (err) {
    console.error("Storage delete error:", err);
    return NextResponse.json({ error: "Failed to delete file(s)" }, { status: 500 });
  }
}
