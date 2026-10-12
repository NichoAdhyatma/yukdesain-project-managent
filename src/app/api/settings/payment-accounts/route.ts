import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  try {
    const accounts = await prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    console.error("Error fetching payment accounts:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, accountNumber, accountHolder, logoUrl, qrisImageUrl } = body;

    if (!type || !name || !accountNumber || !accountHolder) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (!["BANK", "EWALLET"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Get max order
    const maxOrder = await prisma.paymentAccount.aggregate({
      _max: { order: true },
    });

    const account = await prisma.paymentAccount.create({
      data: {
        type,
        name,
        accountNumber,
        accountHolder,
        logoUrl: logoUrl || "",
        qrisImageUrl: qrisImageUrl || "",
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("Error creating payment account:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, accountNumber, accountHolder, logoUrl, qrisImageUrl, isActive, order } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (typeof order === "number") data.order = order;
    if (name !== undefined) data.name = name;
    if (accountNumber !== undefined) data.accountNumber = accountNumber;
    if (accountHolder !== undefined) data.accountHolder = accountHolder;
    if (logoUrl !== undefined) data.logoUrl = logoUrl;
    if (qrisImageUrl !== undefined) data.qrisImageUrl = qrisImageUrl;

    const account = await prisma.paymentAccount.update({
      where: { id },
      data,
    });

    return NextResponse.json({ account });
  } catch (error) {
    console.error("Error updating payment account:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || !user.roles.includes("OWNER")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await prisma.paymentAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting payment account:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
