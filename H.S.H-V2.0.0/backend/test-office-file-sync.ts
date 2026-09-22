import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { connectDatabase, disconnectDatabase } from "./src/config/database";
import { processSyncOperation } from "./src/sync/sync-service";
import { OfficeFileModel } from "./src/models/office-file.model";

async function main() {
  const fileId = `__OFFICE_TEST_${Date.now()}__`;
  await connectDatabase();
  await OfficeFileModel.deleteOne({ id: fileId } as any);

  // CREATE document
  const createRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId,
    operation: "create",
    operationId: "op_office_create_" + Date.now(),
    createdAt: Date.now(),
    payload: {
      id: fileId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "synced",
      type: "document",
      title: "Test Document",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
      isArchived: false,
      isFavorite: false,
    },
  });
  if (!createRes.success) throw new Error(`Create failed: ${createRes.message}`);
  const created = await OfficeFileModel.findOne({ id: fileId });
  if (!created || created.title !== "Test Document") throw new Error("Create not persisted");
  console.log("Office create passed");

  // UPDATE
  const updateRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId,
    operation: "update",
    operationId: "op_office_update_" + Date.now(),
    createdAt: Date.now(),
    payload: { title: "Updated Document", updatedAt: Date.now() },
  });
  if (!updateRes.success) throw new Error(`Update failed: ${updateRes.message}`);
  const updated = await OfficeFileModel.findOne({ id: fileId });
  if (!updated || updated.title !== "Updated Document") throw new Error("Update not persisted");
  console.log("Office update passed");

  // VALIDATION: title too long should be terminal
  const longTitle = "A".repeat(250);
  const validationRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId + "_2",
    operation: "create",
    operationId: "op_office_validation_" + Date.now(),
    createdAt: Date.now(),
    payload: {
      id: fileId + "_2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "synced",
      type: "document",
      title: longTitle,
      content: { type: "doc", content: [] },
    },
  });
  if (validationRes.success) throw new Error("Validation should have failed for long title");
  console.log("Office validation (title length) passed");

  // SIZE limit: content too large
  const hugeContent = { type: "doc", content: Array.from({ length: 6000 }, () => ({ type: "paragraph", content: [{ type: "text", text: "A".repeat(1000) }] })) };
  const sizeRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId + "_huge",
    operation: "create",
    operationId: "op_office_huge_" + Date.now(),
    createdAt: Date.now(),
    payload: {
      id: fileId + "_huge",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "synced",
      type: "document",
      title: "Huge",
      content: hugeContent,
    },
  });
  if (sizeRes.success) throw new Error("Size validation should have failed");
  console.log("Office size validation passed");

  // DELETE
  const deleteRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId,
    operation: "delete",
    operationId: "op_office_delete_" + Date.now(),
    createdAt: Date.now(),
    payload: {},
  });
  if (!deleteRes.success) throw new Error(`Delete failed: ${deleteRes.message}`);
  const deleted = await OfficeFileModel.findOne({ id: fileId });
  if (deleted) throw new Error("Delete not persisted");
  console.log("Office delete passed");

  // Remote requeue check: idempotent create after delete should succeed as recreate
  const recreateRes = await processSyncOperation({
    entity: "officeFile",
    entityId: fileId,
    operation: "create",
    operationId: "op_office_recreate_" + Date.now(),
    createdAt: Date.now(),
    payload: {
      id: fileId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "synced",
      type: "spreadsheet",
      title: "Recreated Sheet",
      content: { sheets: [] },
    },
  });
  if (!recreateRes.success) throw new Error(`Recreate failed: ${recreateRes.message}`);
  console.log("Office recreate passed");

  // Cleanup
  await OfficeFileModel.deleteOne({ id: fileId } as any);
  await OfficeFileModel.deleteOne({ id: fileId + "_2" } as any);
  await OfficeFileModel.deleteOne({ id: fileId + "_huge" } as any);

  await disconnectDatabase();
  console.log("Office file sync tests passed");
}

main().catch(async (e) => {
  console.error("Office sync test failed", e);
  try { await disconnectDatabase(); } catch {}
  process.exit(1);
});
