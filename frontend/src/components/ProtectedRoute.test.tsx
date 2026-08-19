import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "@/lib/auth-context";

vi.mock("@/lib/auth-context", () => ({
  useAuth: vi.fn(),
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  replace.mockReset();
});

describe("ProtectedRoute", () => {
  it("renders nothing and does not redirect while the session is still loading", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true, refresh: vi.fn(), logout: vi.fn() });
    render(
      <ProtectedRoute>
        <p>secret content</p>
      </ProtectedRoute>
    );

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login and renders nothing when logged out", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false, refresh: vi.fn(), logout: vi.fn() });
    render(
      <ProtectedRoute>
        <p>secret content</p>
      </ProtectedRoute>
    );

    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("renders the children and does not redirect when logged in", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "1", email: "a@example.com" },
      loading: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <ProtectedRoute>
        <p>secret content</p>
      </ProtectedRoute>
    );

    expect(screen.getByText("secret content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
