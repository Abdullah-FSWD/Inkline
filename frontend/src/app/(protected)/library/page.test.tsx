import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LibraryPage from "./page";
import { listDocuments, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, listDocuments: vi.fn() };
});

const mockedListDocuments = vi.mocked(listDocuments);

beforeEach(() => {
  mockedListDocuments.mockReset();
});

describe("LibraryPage", () => {
  it("fetches and renders the user's documents on load", async () => {
    mockedListDocuments.mockResolvedValueOnce([
      {
        id: "1",
        title: "My Report",
        sourceType: "pdf",
        status: "ready",
        updatedAt: "2026-01-15T00:00:00.000Z",
        createdAt: "2026-01-15T00:00:00.000Z",
      },
    ]);

    render(<LibraryPage />);

    expect(await screen.findByText("My Report")).toBeInTheDocument();
    expect(mockedListDocuments).toHaveBeenCalledTimes(1);
  });

  it("shows an error message if the list fails to load", async () => {
    mockedListDocuments.mockRejectedValueOnce(new ApiError("Couldn't load your library. Please try again.", 500));

    render(<LibraryPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load your library/i);
  });

  it("shows the empty state when the user has no documents", async () => {
    mockedListDocuments.mockResolvedValueOnce([]);

    render(<LibraryPage />);

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument();
  });
});
