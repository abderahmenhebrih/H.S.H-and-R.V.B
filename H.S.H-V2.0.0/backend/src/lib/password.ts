import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordPolicy(password: string, confirm?: string): string | null {
  if (!password) return "RVB_PASSWORD_REQUIRED";
  if (password.length < 8) return "RVB_PASSWORD_TOO_SHORT";
  if (password.length > 128) return "RVB_PASSWORD_TOO_LONG";
  if (confirm !== undefined && password !== confirm) return "RVB_PASSWORD_CONFIRM_MISMATCH";
  return null;
}
