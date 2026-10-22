import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const u = await prisma.user.findUnique({ where: { email: "rizal@yukdesain.com" } });
  const token = "testowner" + Date.now().toString();
  await prisma.session.create({
    data: { userId: u!.id, token, activeRole: "OWNER", expiresAt: new Date(Date.now() + 86400000) },
  });
  console.log(token);
}
main().finally(() => prisma.$disconnect());
