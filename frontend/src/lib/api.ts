const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }

  return data;
}

export function signup(email: string, password: string): Promise<{ id: string; email: string }> {
  return postJson("/auth/signup", { email, password });
}

export function login(email: string, password: string): Promise<{ id: string; email: string }> {
  return postJson("/auth/login", { email, password });
}
