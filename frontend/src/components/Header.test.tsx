import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Header } from "./Header";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  push.mockReset();
});

describe("Header", () => {
  it("shows nothing in the nav while the session is still loading", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true, refresh: vi.fn(), logout: vi.fn() });
    render(<Header />);

    expect(screen.queryByRole("link", { name: /log in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument();
  });

  it("shows Log in / Sign up when logged out", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false, refresh: vi.fn(), logout: vi.fn() });
    render(<Header />);

    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up/i })).toBeInTheDocument();
  });

  it("shows the user's email and a Log out action when logged in, which calls logout and redirects home", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({ user: { id: "1", email: "a@example.com" }, loading: false, refresh: vi.fn(), logout });
    const user = userEvent.setup();
    render(<Header />);

    expect(screen.getByText("a@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(logout).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });
});
