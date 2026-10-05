"use server";

import { prisma } from "@/lib/db";
import {
  verifyPassword,
  createSession,
  setSessionCookie,
  deleteSession,
  deleteSessionCookie,
  type SessionUser,
} from "@/lib/auth/session";

export type LoginResult =
  | { success: true; user: SessionUser }
  | { success: false; error: string };

export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        roles: true,
      },
    });

    if (!user) {
      return { success: false, error: "Email atau password salah" };
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return { success: false, error: "Email atau password salah" };
    }

    const token = await createSession(user.id, user.roles[0]);
    await setSessionCookie(token);

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        activeRole: user.roles[0],
      },
    };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, error: "Terjadi kesalahan server" };
  }
}

export async function logout(): Promise<void> {
  try {
    await deleteSession();
    await deleteSessionCookie();
  } catch (error) {
    console.error("Logout error:", error);
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { getCurrentUser } = await import("@/lib/auth/session");
  return getCurrentUser();
}
