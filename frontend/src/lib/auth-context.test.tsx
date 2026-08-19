import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";
import { getCurrentUser, logout } from "./api";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, getCurrentUser: vi.fn(), logout: vi.fn() };
});

const mockedGetCurrentUser = vi.mocked(getCurrentUser);
const mockedLogout = vi.mocked(logout);

function Probe() {
  const { user, loading, sessionExpired, refresh, logout } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p>{user ? `logged in as ${user.email}` : "logged out"}</p>
      {sessionExpired && <p>session expired</p>}
      <button onClick={() => refresh()}>refresh</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  mockedGetCurrentUser.mockReset();
  mockedLogout.mockReset();
  localStorage.clear();
});

describe("AuthProvider", () => {
  it("rehydrates the session from the server on mount, without requiring any explicit action", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({ id: "1", email: "a@example.com" });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("logged in as a@example.com")).toBeInTheDocument();
    expect(mockedGetCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("resolves to logged-out when there is no valid session", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(null);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    expect(await screen.findByText("logged out")).toBeInTheDocument();
    expect(screen.queryByText("session expired")).not.toBeInTheDocument();
  });

  it("flags the session as expired when a previously-valid session is lost, not on first load", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({ id: "1", email: "a@example.com" });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText("logged in as a@example.com");
    expect(screen.queryByText("session expired")).not.toBeInTheDocument();

    mockedGetCurrentUser.mockResolvedValueOnce(null);
    await user.click(screen.getByRole("button", { name: "refresh" }));

    expect(await screen.findByText("logged out")).toBeInTheDocument();
    expect(screen.getByText("session expired")).toBeInTheDocument();
  });

  it("does not flag expiry after an explicit logout", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce({ id: "1", email: "a@example.com" });
    mockedLogout.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await screen.findByText("logged in as a@example.com");

    await user.click(screen.getByRole("button", { name: "logout" }));

    expect(await screen.findByText("logged out")).toBeInTheDocument();
    expect(screen.queryByText("session expired")).not.toBeInTheDocument();
  });
});
