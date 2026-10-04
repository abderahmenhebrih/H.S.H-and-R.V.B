import os from "os";
import path from "path";
import fs from "fs";

// Production chat-media storage abstraction (URL-based, no base64 in Mongo).
//
// Providers:
// - "cloudinary" (default in production): Cloudinary object storage, creds from
//   env only. Permanent URLs served from the provider CDN.
// - "local-dev": NON-PRODUCTION ONLY. Files land under os.tmpdir() and are
//   served through the authenticated GET /api/rvb/chats/media/:uploadId route.
//   Render disks are ephemeral, so this is a DEV/QA stand-in, never permanent
//   storage. Hard-refuses to initialise when NODE_ENV === "production".
// - "mock": in-process memory store for deterministic tests. Never uploads
//   anywhere; URLs look like mock://<publicId>.
//
// Clients only ever receive public URLs + metadata. Secrets stay on the
// backend (env vars), never in EXPO_PUBLIC_* / NEXT_PUBLIC_*.

export type ChatMediaKind = "image" | "video";

export const CHAT_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CHAT_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;

function envBytes(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Production size limits (override via env if the provider demands stricter).
export const CHAT_IMAGE_MAX_BYTES = envBytes("CHAT_IMAGE_MAX_BYTES", 8 * 1024 * 1024);
export const CHAT_VIDEO_MAX_BYTES = envBytes("CHAT_VIDEO_MAX_BYTES", 25 * 1024 * 1024);
export const CHAT_ATTACHMENT_MAX_COUNT = 3;

export interface SniffedMedia {
  kind: ChatMediaKind;
  mimeType: string;
}

// Backend-side magic-byte sniffing. Never trusts filename extension or the
// client-supplied Content-Type alone; multer's req.file.mimetype is advisory.
export function sniffMediaBytes(buffer: Buffer): SniffedMedia | null {
  if (!buffer || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { kind: "image", mimeType: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return { kind: "image", mimeType: "image/png" };
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { kind: "image", mimeType: "image/webp" };
  }
  // MP4 / QuickTime: .... "ftyp". Brand "qt  " => QuickTime, else MP4.
  if (buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand.trim() === "qt" || brand === "qt  ") return { kind: "video", mimeType: "video/quicktime" };
    return { kind: "video", mimeType: "video/mp4" };
  }
  // WebM / Matroska: 1A 45 DF A3 (EBML header). Accepted as video/webm.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { kind: "video", mimeType: "video/webm" };
  }
  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

// Minimal server-side dimension parsing (no native deps). Returns null when
// the container cannot be parsed — dimensions are best-effort metadata.
export function getImageDimensions(buffer: Buffer, mimeType: string): ImageDimensions | null {
  try {
    if (mimeType === "image/png") {
      if (buffer.length < 24) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0 && width < 30000 && height < 30000) return { width, height };
      return null;
    }
    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset + 9 <= buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        // SOF0-SOF3 (baseline/extended/progressive/lossless) carry dimensions.
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
          return null;
        }
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
          offset += 2;
          continue;
        }
        const len = buffer.readUInt16BE(offset + 2);
        if (len < 2) break;
        offset += 2 + len;
      }
      return null;
    }
    if (mimeType === "image/webp") {
      // RIFF....WEBP + chunks: VP8X (canvas), VP8 (lossy), VP8L (lossless).
      const fourcc = buffer.toString("ascii", 12, 16);
      if (fourcc === "VP8X" && buffer.length >= 30) {
        const w = 1 + buffer.readUIntLE(24, 3);
        const h = 1 + buffer.readUIntLE(27, 3);
        return { width: w, height: h };
      }
      if (fourcc === "VP8 " && buffer.length >= 30) {
        const w = buffer.readUInt16LE(26) & 0x3fff;
        const h = buffer.readUInt16LE(28) & 0x3fff;
        if (w > 0 && h > 0) return { width: w, height: h };
        return null;
      }
      if (fourcc === "VP8L" && buffer.length >= 25) {
        const b1 = buffer[21];
        const b2 = buffer[22];
        const b3 = buffer[23];
        const b4 = buffer[24];
        const w = 1 + (((b2 & 0x3f) << 8) | b1);
        const h = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        if (w > 0 && h > 0 && w < 20000 && h < 20000) return { width: w, height: h };
        return null;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ChatMediaUploadInput {
  buffer: Buffer;
  mimeType: string;
  kind: ChatMediaKind;
  conversationId: string;
  attachmentId: string;
}

export interface StoredChatMedia {
  // Absolute delivery URL (cloudinary) or absolute-path suffix starting with
  // "/" (local-dev/mock) that the route layer prefixes with the request base.
  url: string;
  publicId: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
}

export interface ChatMediaStorage {
  readonly name: string;
  upload(input: ChatMediaUploadInput): Promise<StoredChatMedia>;
  delete(publicId: string): Promise<void>;
}

function storageFolder(): string {
  return (process.env.CLOUDINARY_CHAT_FOLDER || "rvb/chat").replace(/^\/+|\/+$/g, "") || "rvb/chat";
}

// ---------------- Cloudinary (production) ----------------

class CloudinaryChatMediaStorage implements ChatMediaStorage {
  readonly name = "cloudinary";
  private client: any;

  constructor() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        "[chat-media] Cloudinary requested but CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET are not all set",
      );
    }
    let cloudinary: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cloudinary = require("cloudinary");
    } catch {
      throw new Error("[chat-media] Cloudinary requested but the 'cloudinary' package is not installed");
    }
    const v2 = cloudinary.v2 || cloudinary;
    v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
    this.client = v2;
  }

  upload(input: ChatMediaUploadInput): Promise<StoredChatMedia> {
    const publicId = `${storageFolder()}/${input.conversationId}/${input.attachmentId}`;
    return new Promise((resolve, reject) => {
      const stream = this.client.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: input.kind === "video" ? "video" : "image",
          overwrite: false,
          // Predictable, server-generated keys only — never user filenames.
        },
        (err: any, result: any) => {
          if (err || !result?.secure_url) {
            reject(err || new Error("[chat-media] Cloudinary upload returned no URL"));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id || publicId,
            mimeType: input.mimeType,
            size: typeof result.bytes === "number" ? result.bytes : input.buffer.length,
            width: typeof result.width === "number" ? result.width : null,
            height: typeof result.height === "number" ? result.height : null,
            duration: typeof result.duration === "number" ? Math.round(result.duration) : null,
          });
        },
      );
      stream.end(input.buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    // resource_type unknown here; try image then video (best-effort cleanup).
    for (const resourceType of ["image", "video"] as const) {
      try {
        const res: any = await this.client.uploader.destroy(publicId, { resource_type: resourceType });
        if (res?.result === "ok" || res?.result === "not found") return;
      } catch {}
    }
  }
}

// ---------------- Local dev (NON-PRODUCTION ONLY) ----------------

class LocalDevChatMediaStorage implements ChatMediaStorage {
  readonly name = "local-dev";
  readonly root: string;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[chat-media] local-dev storage is forbidden in production (Render disks are ephemeral)");
    }
    // eslint-disable-next-line no-console
    console.warn("[chat-media] USING local-dev file storage (os.tmpdir, NON-PRODUCTION ONLY, ephemeral). Set Cloudinary env for production.");
    this.root = path.join(os.tmpdir(), "rvb-chat-media");
    fs.mkdirSync(this.root, { recursive: true });
  }

  extFor(mimeType: string): string {
    switch (mimeType) {
      case "image/jpeg": return ".jpg";
      case "image/png": return ".png";
      case "image/webp": return ".webp";
      case "video/mp4": return ".mp4";
      case "video/quicktime": return ".mov";
      case "video/webm": return ".webm";
      default: return ".bin";
    }
  }

  filePathFor(conversationId: string, attachmentId: string, mimeType: string): string {
    // Server-generated path segments only — no user filenames, no traversal.
    const safeConv = String(conversationId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeId = String(attachmentId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.root, safeConv, `${safeId}${this.extFor(mimeType)}`);
  }

  async upload(input: ChatMediaUploadInput): Promise<StoredChatMedia> {
    const fp = this.filePathFor(input.conversationId, input.attachmentId, input.mimeType);
    await fs.promises.mkdir(path.dirname(fp), { recursive: true });
    await fs.promises.writeFile(fp, input.buffer);
    return {
      // Authenticated serving route prefixes the request base URL.
      url: `/api/rvb/chats/media/${input.attachmentId}`,
      publicId: `local-dev:${input.conversationId}/${input.attachmentId}`,
      mimeType: input.mimeType,
      size: input.buffer.length,
      width: null,
      height: null,
      duration: null,
    };
  }

  async delete(publicId: string): Promise<void> {
    const m = /^local-dev:([^/]+)\/(.+)$/.exec(publicId);
    if (!m) return;
    // Extension unknown at delete time — remove any known sibling.
    for (const ext of [".jpg", ".png", ".webp", ".mp4", ".mov", ".webm", ".bin"]) {
      try {
        await fs.promises.unlink(path.join(this.root, m[1].replace(/[^a-zA-Z0-9_-]/g, "_"), `${m[2].replace(/[^a-zA-Z0-9_-]/g, "_")}${ext}`));
      } catch {}
    }
  }
}

// ---------------- Mock (tests) ----------------

class MockChatMediaStorage implements ChatMediaStorage {
  readonly name = "mock";
  readonly objects = new Map<string, Buffer>();

  async upload(input: ChatMediaUploadInput): Promise<StoredChatMedia> {
    const publicId = `mock:${input.conversationId}/${input.attachmentId}`;
    this.objects.set(publicId, input.buffer);
    return {
      // Non-routable .invalid host: behaves like an http(s) URL everywhere
      // (sanitizers, clients) without ever leaving the process.
      url: `http://mock-media.invalid/${encodeURIComponent(publicId)}`,
      publicId,
      mimeType: input.mimeType,
      size: input.buffer.length,
      width: null,
      height: null,
      duration: null,
    };
  }

  async delete(publicId: string): Promise<void> {
    this.objects.delete(publicId);
  }
}

const mockSingleton = new MockChatMediaStorage();
export function getMockChatMediaStorage(): MockChatMediaStorage {
  return mockSingleton;
}

let localDevSingleton: LocalDevChatMediaStorage | null = null;

// Factory. Reads env at call time so tests can switch providers in-process.
// CHAT_STORAGE_PROVIDER: "cloudinary" | "local-dev" | "mock".
// Default: "mock" in test mode, "cloudinary" when Cloudinary env is complete,
// "local-dev" otherwise (dev/QA convenience, never in production).
export function resolveChatMediaStorage(): ChatMediaStorage {
  const explicit = (process.env.CHAT_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "mock") return mockSingleton;
  if (explicit === "local-dev") {
    if (!localDevSingleton) localDevSingleton = new LocalDevChatMediaStorage();
    return localDevSingleton;
  }
  if (explicit === "cloudinary") return new CloudinaryChatMediaStorage();
  const inTest = process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true";
  if (inTest) return mockSingleton;
  const cloudConfigured =
    !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET;
  if (cloudConfigured) return new CloudinaryChatMediaStorage();
  if (process.env.NODE_ENV === "production") {
    throw new Error("[chat-media] No media storage configured in production (set CLOUDINARY_* env)");
  }
  if (!localDevSingleton) localDevSingleton = new LocalDevChatMediaStorage();
  return localDevSingleton;
}
