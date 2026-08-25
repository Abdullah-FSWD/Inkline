import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GuestOnlyRoute } from "./GuestOnlyRoute";
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

describe("GuestOnlyRoute", () => {
  it("renders nothing and does not redirect while the session is still loading", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: true, sessionExpired: false, refresh: vi.fn(), logout: vi.fn() });
    render(
      <GuestOnlyRoute>
        <p>login form</p>
      </GuestOnlyRoute>
    );

    expect(screen.queryByText("login form")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders the children and does not redirect when logged out", () => {
    mockedUseAuth.mockReturnValue({ user: null, loading: false, sessionExpired: false, refresh: vi.fn(), logout: vi.fn() });
    render(
      <GuestOnlyRoute>
        <p>login form</p>
      </GuestOnlyRoute>
    );

    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /library and hides children when already logged in on arrival", async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: "1", email: "a@example.com" },
      loading: false,
      sessionExpired: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    render(
      <GuestOnlyRoute>
        <p>login form</p>
      </GuestOnlyRoute>
    );

    // the redirect + hide happens asynchronously (inside the effect's async wrapper) -
    // wait for it rather than asserting synchronously.
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/library"));
    expect(screen.queryByText("login form")).not.toBeInTheDocument();
  });

  it("does not redirect (or hide children) if the user logs in later on this same page", async () => {
    // this is the whole point of the one-time check: submitting the login/signup form on
    // this page logs the user in via the SAME auth context this component reads - without
    // the one-time guard, that would trigger a redirect and yank the page away before the
    // form's own success state (or LoginForm's own redirect) ever gets a chance to run.
    mockedUseAuth.mockReturnValue({ user: null, loading: false, sessionExpired: false, refresh: vi.fn(), logout: vi.fn() });
    const { rerender } = render(
      <GuestOnlyRoute>
        <p>login form</p>
      </GuestOnlyRoute>
    );
    expect(screen.getByText("login form")).toBeInTheDocument();

    mockedUseAuth.mockReturnValue({
      user: { id: "1", email: "a@example.com" },
      loading: false,
      sessionExpired: false,
      refresh: vi.fn(),
      logout: vi.fn(),
    });
    rerender(
      <GuestOnlyRoute>
        <p>login form</p>
      </GuestOnlyRoute>
    );

    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
