import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SignupForm } from "./SignupForm";
import { signup, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, signup: vi.fn() };
});

const mockedSignup = vi.mocked(signup);

beforeEach(() => {
  mockedSignup.mockReset();
});

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  render(<SignupForm />);
  if (email) await user.type(screen.getByLabelText(/email/i), email);
  if (password) await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole("button", { name: /sign up/i }));
}

describe("SignupForm", () => {
  it("shows a success message after a successful signup", async () => {
    mockedSignup.mockResolvedValueOnce({ id: "1", email: "a@example.com" });
    await fillAndSubmit("a@example.com", "correct-horse");

    expect(await screen.findByRole("status")).toHaveTextContent(/account created/i);
    expect(mockedSignup).toHaveBeenCalledWith("a@example.com", "correct-horse");
  });

  it("shows a validation error for an invalid email without calling the API", async () => {
    await fillAndSubmit("not-an-email", "correct-horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it("shows a validation error for a short password without calling the API", async () => {
    await fillAndSubmit("a@example.com", "short");

    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    expect(mockedSignup).not.toHaveBeenCalled();
  });

  it("shows the server's error message on a duplicate email", async () => {
    mockedSignup.mockRejectedValueOnce(new ApiError("An account with this email already exists.", 409));
    await fillAndSubmit("a@example.com", "correct-horse");

    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });
});
