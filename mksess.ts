import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient()
;
async function main() {
  const u = await prisma.user.findUnique({ where: { email: "ivan@yukdesain.com" } });
  const token = "testdesigner" + Date.now().toString();
  await prisma.session.create({
    data: { userId: u!.id, token, activeRole: "DESIGNER", expiresAt: new Date(Date.now() + 86400000) },
  });
  console.log(token);
}
main().finally(() => prisma.$disconnect());
