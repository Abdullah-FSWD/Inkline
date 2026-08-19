import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LibraryPage from "./page";
import { listDocuments, deleteDocument, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, listDocuments: vi.fn(), deleteDocument: vi.fn() };
});

const mockedListDocuments = vi.mocked(listDocuments);
const mockedDeleteDocument = vi.mocked(deleteDocument);

const oneDocument = [
  {
    id: "1",
    title: "My Report",
    sourceType: "pdf",
    status: "ready",
    updatedAt: "2026-01-15T00:00:00.000Z",
    createdAt: "2026-01-15T00:00:00.000Z",
  },
];

beforeEach(() => {
  mockedListDocuments.mockReset();
  mockedDeleteDocument.mockReset();
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

  it("removes a document from the list after confirmed deletion", async () => {
    mockedListDocuments.mockResolvedValueOnce(oneDocument);
    mockedDeleteDocument.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<LibraryPage />);

    await screen.findByText("My Report");
    await user.click(screen.getByRole("button", { name: /delete my report/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete my report/i }));

    expect(mockedDeleteDocument).toHaveBeenCalledWith("1");
    expect(screen.queryByText("My Report")).not.toBeInTheDocument();
  });

  it("restores the document and shows an error if deletion fails", async () => {
    mockedListDocuments.mockResolvedValueOnce(oneDocument);
    mockedDeleteDocument.mockRejectedValueOnce(new ApiError("Couldn't delete this document. Please try again.", 500));
    const user = userEvent.setup();
    render(<LibraryPage />);

    await screen.findByText("My Report");
    await user.click(screen.getByRole("button", { name: /delete my report/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete my report/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't delete this document/i);
    expect(screen.getByText("My Report")).toBeInTheDocument();
  });
});
