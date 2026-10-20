// Demo-only role switch (no real auth): owner, manager or staff, stored in a cookie.
import "server-only";
import { cookies } from "next/headers";

export const ROLES = ["owner", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_COOKIE = "ux_role";

export async function getRole(): Promise<Role> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : "owner";
}
