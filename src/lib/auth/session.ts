import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const SESSION_COOKIE_NAME = "yukdesain_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  activeRole: string | null;
};

export type Session = {
  token: string;
  user: SessionUser;
  expiresAt: Date;
};

type SessionPayload = JWTPayload & {
  sub: string;   // userId
  name: string;
  email: string;
  roles: string[];
  activeRole: string | null;
};

async function getJwtSecret(): Promise<Uint8Array> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET not set");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createSession(userId: string, activeRole: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, roles: true },
  });
  if (!user) throw new Error("User not found");

  const secret = await getJwtSecret();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  const token = await new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    activeRole,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    const secret = await getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as SessionPayload;

    return {
      token,
      user: {
        id: p.sub,
        name: p.name,
        email: p.email,
        roles: p.roles,
        activeRole: p.activeRole,
      },
      expiresAt: new Date((p.exp ?? 0) * 1000),
    };
  } catch {
    // Invalid or expired token
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

export async function requireOwner(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.roles.includes("OWNER")) throw new Error("Forbidden: Owner access required");
  return user;
}

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function createSessionWithRole(
  userId: string,
  name: string,
  email: string,
  roles: string[],
  activeRole: string
): Promise<string> {
  const secret = await getJwtSecret();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  return new SignJWT({
    sub: userId,
    name,
    email,
    roles,
    activeRole,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret);
}

export async function setSessionCookieFromToken(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}
