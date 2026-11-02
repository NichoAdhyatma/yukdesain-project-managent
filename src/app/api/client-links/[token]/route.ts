import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientLinkSelect,
  clientPaymentAccountSelect,
  toClientLinkDto,
  toClientPaymentAccountDto,
} from "@/lib/client-portal/link-dto";

const linkExpired = () =>
  NextResponse.json({ error: "Link has expired", code: "LINK_EXPIRED" }, { status: 410 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await prisma.clientLink.findUnique({
      where: { token },
      select: clientLinkSelect,
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found", code: "NOT_FOUND" }, { status: 404 });
    }

    // Check expiration
    const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
    if (isExpired && link.status === "ACTIVE") {
      // Mark as expired if not already
      await prisma.clientLink.update({
        where: { id: link.id },
        data: { status: "EXPIRED" },
      });
      return linkExpired();
    }

    // Check expired - block if already marked expired
    if (link.status === "EXPIRED") {
      return linkExpired();
    }

    // Fetch active payment accounts for the studio
    const paymentAccounts = await prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
      select: clientPaymentAccountSelect,
    });

    // ACTIVE, LOCKED and SUBMITTED links all return tracking data
    return NextResponse.json({
      link: toClientLinkDto(link),
      paymentAccounts: paymentAccounts.map(toClientPaymentAccountDto),
    });
  } catch (error) {
    console.error("Error fetching link:", error);
    return NextResponse.json(
      { error: "Failed to fetch link", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }
}
