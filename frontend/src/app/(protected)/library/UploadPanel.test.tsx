import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { UploadPanel } from "./UploadPanel";
import { uploadDocument, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, uploadDocument: vi.fn() };
});

const mockedUpload = vi.mocked(uploadDocument);

function pdfFile(name = "report.pdf") {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

beforeEach(() => {
  mockedUpload.mockReset();
});

describe("UploadPanel", () => {
  it("rejects a non-PDF file dropped onto the dropzone, without calling the API", async () => {
    // drag-and-drop bypasses the file input's `accept` filter (both in real browsers and
    // in user-event), so this is the realistic path for exercising the rejection branch -
    // a plain input.upload() of a mismatched file never reaches onChange at all.
    render(<UploadPanel />);

    const dropzone = screen.getByRole("button", { name: /choose a pdf/i });
    const file = new File(["hi"], "notes.txt", { type: "text/plain" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/only pdf files/i);
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it("uploads a selected PDF and shows a success message with the returned title", async () => {
    mockedUpload.mockResolvedValueOnce({
      id: "1",
      title: "report",
      sourceType: "pdf",
      status: "ready",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const user = userEvent.setup();
    render(<UploadPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pdfFile());
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("report");
    expect(mockedUpload).toHaveBeenCalledWith(expect.any(File), expect.any(Function));
  });

  it("shows the server's error message when the upload fails", async () => {
    mockedUpload.mockRejectedValueOnce(new ApiError("Only PDF files are supported right now.", 400));
    const user = userEvent.setup();
    render(<UploadPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pdfFile());
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/only pdf files/i);
  });

  it("lets the user remove a selected file before uploading", async () => {
    const user = userEvent.setup();
    render(<UploadPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, pdfFile());
    expect(screen.getByText("report.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^upload$/i })).not.toBeInTheDocument();
  });
});
