import { NextResponse } from "next/server";
import { getStorageStats, listAllObjects } from "@/lib/r2";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const [stats, objects] = await Promise.all([
      getStorageStats(),
      listAllObjects(),
    ]);

    // Sort by lastModified descending
    objects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    // Filter by category if specified
    const filtered = category && category !== "all"
      ? objects.filter((o) => o.category === category)
      : objects;

    // Paginate
    const start = (page - 1) * limit;
    const paginatedItems = filtered.slice(start, start + limit);

    return NextResponse.json({
      stats,
      items: paginatedItems,
      pagination: {
        page,
        limit,
        total: filtered.length,
        totalPages: Math.ceil(filtered.length / limit),
      },
    });
  } catch (err) {
    console.error("Storage API error:", err);
    return NextResponse.json({ error: "Failed to fetch storage data" }, { status: 500 });
  }
}
