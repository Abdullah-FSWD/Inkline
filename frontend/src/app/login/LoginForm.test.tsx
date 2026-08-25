import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { LoginForm } from "./LoginForm";
import { login, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, login: vi.fn() };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const mockedReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockedReplace }),
}));

const mockedLogin = vi.mocked(login);
const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  mockedLogin.mockReset();
  mockedReplace.mockReset();
  mockedUseAuth.mockReturnValue({
    user: null,
    loading: false,
    sessionExpired: false,
    refresh: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  });
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  render(<LoginForm />);
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /log in/i }));
}

describe("LoginForm", () => {
  it("redirects to the library after a successful login, instead of showing an interstitial", async () => {
    mockedLogin.mockResolvedValueOnce({ id: "1", email: "a@example.com" });
    await fillAndSubmit("a@example.com", "correct-horse");

    expect(mockedLogin).toHaveBeenCalledWith("a@example.com", "correct-horse");
    expect(mockedReplace).toHaveBeenCalledWith("/library");
  });

  it("requires both fields before calling the API", async () => {
    await fillAndSubmit("a@example.com", "");

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your email and password/i);
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  it("shows the server's generic error on invalid credentials, without saying which field was wrong", async () => {
    mockedLogin.mockRejectedValueOnce(new ApiError("Invalid email or password.", 401));
    await fillAndSubmit("a@example.com", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });
});
