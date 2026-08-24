const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }

  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }

  return data;
}

export function signup(email: string, password: string): Promise<AuthUser> {
  return postJson("/auth/signup", { email, password });
}

export function login(email: string, password: string): Promise<AuthUser> {
  return postJson("/auth/login", { email, password });
}

export function logout(): Promise<{ ok: true }> {
  return postJson("/auth/logout");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;

  const data = await res.json();
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status);
  return data;
}

export interface UploadedDocument {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  createdAt: string;
}

// fetch has no upload-progress API, so this uses XMLHttpRequest instead.
export function uploadDocument(file: File, onProgress?: (percent: number) => void): Promise<UploadedDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/documents/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let data: { error?: string } & Partial<UploadedDocument> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON response body; fall through with an empty object
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as UploadedDocument);
      } else {
        reject(new ApiError(data.error ?? "Something went wrong.", xhr.status));
      }
    };

    xhr.onerror = () => reject(new ApiError("Network error. Please try again.", 0));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export interface DocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  updatedAt: string;
  createdAt: string;
}

export function listDocuments(): Promise<DocumentSummary[]> {
  return getJson("/documents");
}

export function getDocument(id: string): Promise<DocumentSummary> {
  return getJson(`/documents/${id}`);
}

export function getDocumentFileUrl(id: string): string {
  return `${API_URL}/documents/${id}/file`;
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/documents/${id}`, { method: "DELETE", credentials: "include" });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }
}

export interface AnnotationInput {
  pageNumber: number;
  tool: string;
  color: string;
  width: number;
  opacity: number;
  points: { x: number; y: number }[];
}

export interface AnnotationRecord extends AnnotationInput {
  id: string;
}

export function listAnnotations(documentId: string): Promise<AnnotationRecord[]> {
  return getJson(`/documents/${documentId}/annotations`);
}

export function createAnnotation(documentId: string, stroke: AnnotationInput): Promise<AnnotationRecord> {
  return postJson(`/documents/${documentId}/annotations`, stroke);
}

export async function deleteAnnotation(documentId: string, annotationId: string): Promise<void> {
  const res = await fetch(`${API_URL}/documents/${documentId}/annotations/${annotationId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? "Something went wrong.", res.status);
  }
}
