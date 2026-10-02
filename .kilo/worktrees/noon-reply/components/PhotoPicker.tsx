"use client";

import { useRef } from "react";

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// Max edge length we resize to before saving, so we don't ship a 12MP photo
// over the wire / store it as a giant data URI in localStorage and D1.
const MAX_EDGE = 720;
const JPEG_QUALITY = 0.86;

type PhotoPickerProps = {
  photoUrl: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
};

export function PhotoPicker({ photoUrl, onChange, onError }: PhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
      onError("That doesn't look like an image. Try a JPG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError("Photo is too large — please pick one under 4 MB.");
      return;
    }

    try {
      const dataUrl = await resizeImageToDataUrl(file);
      onChange(dataUrl);
    } catch {
      onError("Couldn't read that photo. Try another one.");
    }
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={openPicker}
        className="photo-picker"
        aria-label={photoUrl ? "Change profile photo" : "Add profile photo"}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="Your profile photo preview" />
        ) : (
          <span className="photo-picker-placeholder">
            <span aria-hidden="true" className="photo-picker-icon">📷</span>
            <span>Tap to add a photo</span>
            <span className="text-xs font-normal text-white/52">JPG, PNG or WebP · up to 4 MB</span>
          </span>
        )}
      </button>

      <div className="flex justify-center gap-3">
        {photoUrl ? (
          <>
            <button
              type="button"
              onClick={openPicker}
              className="text-sm font-bold text-white/72 hover:text-white"
            >
              Replace photo
            </button>
            <span aria-hidden="true" className="text-white/24">·</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-sm font-bold text-white/72 hover:text-white"
            >
              Remove
            </button>
          </>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/*
 * Loads the user's image, draws it into a canvas with the longer edge clamped
 * to MAX_EDGE, and returns a JPEG data URL. Keeps localStorage + the D1 row
 * small while preserving enough quality for a profile photo. iOS HEIC photos
 * decode through <img>/createImageBitmap on modern Safari, so this works for
 * the typical "photo I just took on my phone" path.
 */
async function resizeImageToDataUrl(file: File): Promise<string> {
  const bitmap = await loadBitmap(file);
  const sourceW = bitmap.width;
  const sourceH = bitmap.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(sourceW, sourceH));
  const targetW = Math.round(sourceW * scale);
  const targetH = Math.round(sourceH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement path below.
    }
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("image-load-failed"));
    };
    img.src = objectUrl;
  });
}
