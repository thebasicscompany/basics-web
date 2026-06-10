"use client";

export type UploadedMaterial = {
  id: string;
  label: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

/**
 * Full client-side upload pipeline: presign -> PUT to S3 -> finalize into a
 * ContextSource row (optionally attached to a chat session).
 */
export async function uploadMaterial(
  courseId: string,
  file: File,
  sessionId?: string,
): Promise<UploadedMaterial> {
  const contentType = file.type || "application/octet-stream";

  const presignResponse = await fetch(`/api/courses/${courseId}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      size: file.size,
    }),
  });

  if (!presignResponse.ok) {
    const body = (await presignResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Upload failed.");
  }

  const { uploadUrl, s3Key } = (await presignResponse.json()) as {
    uploadUrl: string;
    s3Key: string;
  };

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error("Upload to storage failed.");
  }

  const finalizeResponse = await fetch(`/api/courses/${courseId}/materials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      s3Key,
      filename: file.name,
      mimeType: contentType,
      size: file.size,
      ...(sessionId ? { sessionId } : {}),
    }),
  });

  if (!finalizeResponse.ok) {
    const body = (await finalizeResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to save the material.");
  }

  const { material } = (await finalizeResponse.json()) as {
    material: UploadedMaterial;
  };

  return material;
}

/**
 * Session-scoped upload pipeline for intake sessions, where materials
 * arrive before any course exists. create_course links them to the course.
 */
export async function uploadSessionMaterial(
  sessionId: string,
  file: File,
): Promise<UploadedMaterial> {
  const contentType = file.type || "application/octet-stream";

  const presignResponse = await fetch(`/api/sessions/${sessionId}/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType,
      size: file.size,
    }),
  });

  if (!presignResponse.ok) {
    const body = (await presignResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Upload failed.");
  }

  const { uploadUrl, s3Key } = (await presignResponse.json()) as {
    uploadUrl: string;
    s3Key: string;
  };

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error("Upload to storage failed.");
  }

  const finalizeResponse = await fetch(`/api/sessions/${sessionId}/materials`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      s3Key,
      filename: file.name,
      mimeType: contentType,
      size: file.size,
    }),
  });

  if (!finalizeResponse.ok) {
    const body = (await finalizeResponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to save the material.");
  }

  const { material } = (await finalizeResponse.json()) as {
    material: UploadedMaterial;
  };

  return material;
}

export async function deleteMaterial(materialId: string): Promise<void> {
  const response = await fetch(`/api/materials/${materialId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete the material.");
  }
}
