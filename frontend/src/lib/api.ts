const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }

  return data;
}

export function signup(email: string, password: string): Promise<AuthUser> {
  return postJson("/auth/signup", { email, password });
}

export function login(email: string, password: string): Promise<AuthUser> {
  return postJson("/auth/login", { email, password });
}

export function logout(): Promise<{ ok: true }> {
  return postJson("/auth/logout");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;

  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status);
  return data;
}
