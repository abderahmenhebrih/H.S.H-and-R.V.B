import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { ChatUploadModel } from "../models/chat-upload.model";
import { ConversationModel } from "../models/conversation.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import {
  sniffMediaBytes,
  getImageDimensions,
  resolveChatMediaStorage,
  deleteChatMediaBlob,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_VIDEO_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_COUNT,
  type ChatMediaKind,
} from "./chat-media-storage.service";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

export type TrustedChatAttachment = {
  id: string;
  kind: ChatMediaKind;
  url: string;
  publicId: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
};

// Uploads older than this without a message referencing them are orphans.
export const CHAT_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

async function requireSendAccess(conversationId: string, accountId: string) {
  const conv: any = await ConversationModel.findOne({ id: conversationId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  const sender: any = await RvbAccountModel.findOne({ id: accountId }).lean();
  if (!sender || sender.status !== "active") throw codeError("RVB_FORBIDDEN", 403);
  const member = (conv.participants as any[]).some((p: any) => p.accountId === accountId && !p.leftAt);
  if (!member) throw codeError("RVB_FORBIDDEN", 403, "Not member");
  return conv;
}

function toAbsoluteUrl(maybeRelative: string, baseUrl?: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const base = (baseUrl || "").replace(/\/+$/, "");
  if (!base) return maybeRelative;
  return `${base}${maybeRelative.startsWith("/") ? maybeRelative : `/${maybeRelative}`}`;
}

export async function uploadChatAttachment(input: {
  conversationId: string;
  uploaderAccountId: string;
  buffer: Buffer;
  clientMime?: string;
  baseUrl?: string;
}): Promise<TrustedChatAttachment> {
  const { conversationId, uploaderAccountId } = input;
  const buffer = input.buffer;
  // SAME authorization as sendMessage: non-members (incl. IDOR attempts on
  // other users' private conversations) cannot upload.
  await requireSendAccess(conversationId, uploaderAccountId);
  if (!buffer || buffer.length === 0) throw codeError("RVB_ATTACHMENT_INVALID", 400, "Empty file");
  // Backend-side magic-byte sniffing — extension/client MIME never trusted.
  const sniffed = sniffMediaBytes(buffer);
  if (!sniffed) throw codeError("RVB_ATTACHMENT_INVALID_TYPE", 400, "Unsupported media (jpeg/png/webp/mp4/mov/webm only)");
  const cap = sniffed.kind === "image" ? CHAT_IMAGE_MAX_BYTES : CHAT_VIDEO_MAX_BYTES;
  if (buffer.length > cap) {
    throw codeError(
      "RVB_ATTACHMENT_TOO_LARGE",
      413,
      sniffed.kind === "image"
        ? `Image too large (max ${Math.round(cap / 1024 / 1024)} MB)`
        : `Video too large (max ${Math.round(cap / 1024 / 1024)} MB)`,
    );
  }
  const dims = sniffed.kind === "image" ? getImageDimensions(buffer, sniffed.mimeType) : null;
  const attachmentId = `att-${uuidv4()}`;
  const now = Date.now();
  let stored;
  try {
    stored = await resolveChatMediaStorage().upload({
      buffer,
      mimeType: sniffed.mimeType,
      kind: sniffed.kind,
      conversationId,
      attachmentId,
    });
  } catch (e: any) {
    if (e?.code) throw e;
    if (/No media storage configured|forbidden in production|not installed/i.test(e?.message || "")) {
      throw codeError("RVB_MEDIA_NOT_CONFIGURED", 503, "Chat media storage is not configured");
    }
    throw codeError("RVB_ATTACHMENT_UPLOAD_FAILED", 502, e?.message || "Media upload failed");
  }
  const url = toAbsoluteUrl(stored.url, input.baseUrl);
  await ChatUploadModel.create({
    id: attachmentId,
    createdAt: now,
    expiresAt: now + CHAT_UPLOAD_TTL_MS,
    conversationId,
    uploaderAccountId,
    kind: sniffed.kind,
    mimeType: sniffed.mimeType,
    size: stored.size,
    width: stored.width ?? dims?.width ?? null,
    height: stored.height ?? dims?.height ?? null,
    duration: stored.duration ?? null,
    url,
    publicId: stored.publicId,
    provider: resolveChatMediaStorage().name,
    status: "pending",
  } as any);
  return {
    id: attachmentId,
    kind: sniffed.kind,
    url,
    publicId: stored.publicId,
    mimeType: sniffed.mimeType,
    size: stored.size,
    width: stored.width ?? dims?.width ?? null,
    height: stored.height ?? dims?.height ?? null,
    duration: stored.duration ?? null,
  };
}

// Trusted reference resolution for sendMessage. The client supplies ONLY
// upload ids; every byte of the final Message.attachments comes from the
// server-side ChatUpload row created by the authenticated upload flow.
// Arbitrary client URLs can never reach the Message document.
export async function resolveAttachmentIds(
  ids: unknown,
  opts: { conversationId: string; senderId: string },
): Promise<TrustedChatAttachment[]> {
  if (ids === undefined || ids === null) return [];
  if (!Array.isArray(ids)) throw codeError("RVB_ATTACHMENT_INVALID", 400, "attachmentIds must be an array");
  if (ids.length === 0) return [];
  if (ids.length > CHAT_ATTACHMENT_MAX_COUNT)
    throw codeError("RVB_ATTACHMENT_LIMIT", 400, `Max ${CHAT_ATTACHMENT_MAX_COUNT} attachments`);
  const now = Date.now();
  const out: TrustedChatAttachment[] = [];
  for (const raw of ids) {
    const id = String(raw || "");
    if (!id) throw codeError("RVB_ATTACHMENT_INVALID", 400, "Invalid attachment id");
    const rec: any = await ChatUploadModel.findOne({ id }).lean();
    if (!rec) throw codeError("RVB_ATTACHMENT_INVALID", 400, "Unknown attachment (upload first)");
    if (rec.conversationId !== opts.conversationId)
      throw codeError("RVB_ATTACHMENT_NOT_ALLOWED", 403, "Attachment belongs to another conversation");
    if (rec.uploaderAccountId !== opts.senderId)
      throw codeError("RVB_ATTACHMENT_NOT_ALLOWED", 403, "Attachment belongs to another user");
    if (rec.expiresAt < now && rec.status === "pending")
      throw codeError("RVB_ATTACHMENT_NOT_ALLOWED", 403, "Attachment expired (upload again)");
    // Defensive: legacy/foreign rows must never leak binary into messages.
    out.push({
      id: rec.id,
      kind: rec.kind,
      url: rec.url,
      publicId: rec.publicId,
      mimeType: rec.mimeType,
      size: rec.size,
      width: rec.width ?? null,
      height: rec.height ?? null,
      duration: rec.duration ?? null,
    });
  }
  return out;
}

export async function markAttachmentsAttached(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await ChatUploadModel.updateMany({ id: { $in: ids } }, { $set: { status: "attached" } });
}

// Orphan cleanup: pending uploads that expired without ever being attached.
// Deletes the provider blob first; the row is removed only when the blob is
// confirmed gone. Cloudinary hard failures (network/auth) keep the row for
// retry on the next cycle. Attached rows are kept as the ownership trail.
// Wire to a scheduler/cron; safe to run concurrently across instances only in
// the sense that double-deletes are idempotent (mock/local-dev deletes and
// Cloudinary destroy are all idempotent).
export async function deleteOrphanChatUploads(limit = 100): Promise<{ rows: number; blobs: number }> {
  const now = Date.now();
  const orphans: any[] = await ChatUploadModel.find({ status: "pending", expiresAt: { $lt: now } })
    .limit(limit)
    .lean();
  let blobs = 0;
  let deleted = 0;
  for (const o of orphans) {
    try {
      await deleteChatMediaBlob(o.publicId, o.provider);
      blobs++;
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn("[chat-upload-cleanup] blob delete failed, keeping row for retry:", o.id, e?.message);
      continue;
    }
    await ChatUploadModel.deleteOne({ id: o.id });
    deleted++;
  }
  return { rows: deleted, blobs };
}

// Authenticated local-dev file serving helper for GET /media/:uploadId.
export async function getUploadFilePath(uploadId: string): Promise<{ path: string; mimeType: string } | null> {
  const rec: any = await ChatUploadModel.findOne({ id: uploadId }).lean();
  if (!rec || rec.provider !== "local-dev") return null;
  const storage = resolveChatMediaStorage() as any;
  if (typeof storage.filePathFor !== "function") return null;
  const fp = storage.filePathFor(rec.conversationId, rec.id, rec.mimeType);
  try {
    await fs.promises.access(fp, fs.constants.R_OK);
  } catch {
    return null;
  }
  return { path: fp, mimeType: rec.mimeType };
}
