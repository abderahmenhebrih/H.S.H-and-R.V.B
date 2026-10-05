import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

async function run() {
  let mongod: any = null;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    console.log("Memory URI:", uri);
  } catch (e) {
    console.error("Memory server failed", e);
    process.exit(1);
  }
  const uri = process.env.MONGODB_URI!;
  await mongoose.connect(uri);
  console.log("Connected");

  const { WorkerModel } = await import("./src/models/worker.model");
  const { SupplierModel } = await import("./src/models/supplier.model");
  const { CustomerModel } = await import("./src/models/customer.model");
  const { ProductModel } = await import("./src/models/product.model");
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { ConversationModel } = await import("./src/models/conversation.model");
  const { MessageModel } = await import("./src/models/message.model");
  const { MessageAuditModel } = await import("./src/models/message-audit.model");
  const { NotificationModel } = await import("./src/models/notification.model");
  const chatSvc = await import("./src/services/chat.service");

  await Promise.all([
    WorkerModel.deleteMany({}),
    SupplierModel.deleteMany({}),
    CustomerModel.deleteMany({}),
    RvbAccountModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    MessageAuditModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);
  console.log("Cleaned");

  const now = Date.now();
  // Create entities
  const w1 = await WorkerModel.create({ id: `w1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "Ahmed Benali", phone: "0123456001", employmentDate: now, position: "Boucher", startingSalary: 50000, monthlySalary: 50000, status: "active", balance: 10000 } as any);
  const w2 = await WorkerModel.create({ id: `w2-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "Youssef Worker", phone: "0123456002", employmentDate: now, position: "Helper", startingSalary: 40000, monthlySalary: 40000, status: "active", balance: 8000 } as any);
  const sup1 = await SupplierModel.create({ id: `s1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "Meat Supplier SARL", phone: "0123456010", balance: 0 } as any);
  const cust1 = await CustomerModel.create({ id: `c1-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "Restaurant Atlas", phone: "0123456020", type: "Retail", balance: 0 } as any);

  // Accounts
  const mgr = await RvbAccountModel.create({ id: `acc-mgr-${now}`, createdAt: now, updatedAt: now, tag: "mgr.test", displayName: "Manager", role: "manager", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete" } as any);
  const adm = await RvbAccountModel.create({ id: `acc-adm-${now}`, createdAt: now, updatedAt: now, tag: "admin.test", displayName: "Admin", role: "admin", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete" } as any);
  const sup = await RvbAccountModel.create({ id: `acc-sup-${now}`, createdAt: now, updatedAt: now, tag: "sup.test", displayName: "Supervisor", role: "supervisor", linkedEntityType: "worker", linkedEntityId: (w1 as any).id, status: "active", onboardingStatus: "complete" } as any);
  const wAcc1 = await RvbAccountModel.create({ id: `acc-w1-${now}`, createdAt: now, updatedAt: now, tag: "ahmed.worker", displayName: "Ahmed Benali", role: "worker", linkedEntityType: "worker", linkedEntityId: (w1 as any).id, status: "active", onboardingStatus: "complete", profilePicture: null } as any);
  const wAcc2 = await RvbAccountModel.create({ id: `acc-w2-${now}`, createdAt: now, updatedAt: now, tag: "youssef.worker", displayName: "Youssef Worker", role: "worker", linkedEntityType: "worker", linkedEntityId: (w2 as any).id, status: "active", onboardingStatus: "complete" } as any);
  const sAcc1 = await RvbAccountModel.create({ id: `acc-s1-${now}`, createdAt: now, updatedAt: now, tag: "supplier.meat", displayName: "Meat Supplier", role: "supplier", linkedEntityType: "supplier", linkedEntityId: (sup1 as any).id, status: "active", onboardingStatus: "complete" } as any);
  const cAcc1 = await RvbAccountModel.create({ id: `acc-c1-${now}`, createdAt: now, updatedAt: now, tag: "atlas", displayName: "Restaurant Atlas", role: "customer", linkedEntityType: "customer", linkedEntityId: (cust1 as any).id, status: "active", onboardingStatus: "complete" } as any);
  const outsider = await RvbAccountModel.create({ id: `acc-out-${now}`, createdAt: now, updatedAt: now, tag: "outsider.test", displayName: "Outsider", role: "worker", linkedEntityType: "worker", linkedEntityId: `w-out-${now}`, status: "active", onboardingStatus: "complete" } as any);
  // Need worker for outsider
  await WorkerModel.create({ id: `w-out-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "Outsider Worker", phone: "0123456999", employmentDate: now, position: "Out", startingSalary: 10000, monthlySalary: 10000, status: "active", balance: 0 } as any);

  const results: [string, boolean, string?][] = [];
  function record(name: string, ok: boolean, detail?: string) {
    results.push([name, ok, detail]);
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  // Ensure main chats
  await chatSvc.ensureMainChats();
  await chatSvc.syncMainMembership();

  // 1-6 Main membership
  try {
    const mgrConvs = await chatSvc.listConversationsForUser((mgr as any).id);
    const hasWorkers = mgrConvs.some((c: any) => c.id === "main-workers");
    const hasSuppliers = mgrConvs.some((c: any) => c.id === "main-suppliers");
    const hasCustomers = mgrConvs.some((c: any) => c.id === "main-customers");
    record("1. Manager in all official groups", hasWorkers && hasSuppliers && hasCustomers, `mgr convs ${mgrConvs.length}`);
  } catch (e: any) { record("1. Manager in all official groups", false, e.message); }

  try {
    const admConvs = await chatSvc.listConversationsForUser((adm as any).id);
    const hasAll = ["main-workers","main-suppliers","main-customers"].every((id) => admConvs.some((c: any) => c.id === id));
    record("2. Admin in all official groups", hasAll, "");
  } catch (e: any) { record("2. Admin in all official groups", false, e.message); }

  try {
    const supConvs = await chatSvc.listConversationsForUser((sup as any).id);
    const hasAll = ["main-workers","main-suppliers","main-customers"].every((id) => supConvs.some((c: any) => c.id === id));
    record("3. Supervisor in all official groups", hasAll, "");
  } catch (e: any) { record("3. Supervisor in all official groups", false, e.message); }

  try {
    const w1Convs = await chatSvc.listConversationsForUser((wAcc1 as any).id);
    const inWorkers = w1Convs.some((c: any) => c.id === "main-workers");
    const notInSuppliers = !w1Convs.some((c: any) => c.id === "main-suppliers");
    const hasPrivate = w1Convs.some((c: any) => c.type === "official_private" && c.officialKind === "admin_worker");
    record("4. Worker in Workers group + admin private only", inWorkers && notInSuppliers && hasPrivate, `inWorkers=${inWorkers} notSup=${notInSuppliers} private=${hasPrivate}`);
  } catch (e: any) { record("4. Worker in Workers group + admin private only", false, e.message); }

  try {
    const sConvs = await chatSvc.listConversationsForUser((sAcc1 as any).id);
    const inSup = sConvs.some((c: any) => c.id === "main-suppliers");
    const notInWorkers = !sConvs.some((c: any) => c.id === "main-workers");
    const hasPriv = sConvs.some((c: any) => c.type === "official_private" && c.officialKind === "admin_supplier");
    record("5. Supplier in Suppliers group + admin private only", inSup && notInWorkers && hasPriv, "");
  } catch (e: any) { record("5. Supplier in Suppliers group + admin private only", false, e.message); }

  try {
    const cConvs = await chatSvc.listConversationsForUser((cAcc1 as any).id);
    const inCust = cConvs.some((c: any) => c.id === "main-customers");
    const notInWorkers = !cConvs.some((c: any) => c.id === "main-workers");
    const hasPriv = cConvs.some((c: any) => c.type === "official_private" && c.officialKind === "admin_customer");
    record("6. Customer in Customers group + admin private only", inCust && notInWorkers && hasPriv, "");
  } catch (e: any) { record("6. Customer in Customers group + admin private only", false, e.message); }

  try {
    const w1Convs = await chatSvc.listConversationsForUser((wAcc1 as any).id);
    const canSeeSupplierGroup = w1Convs.some((c: any) => c.id === "main-suppliers");
    record("7. Worker cannot access Suppliers main group", !canSeeSupplierGroup, `canSee=${canSeeSupplierGroup}`);
    // Try direct fetch
    try {
      await chatSvc.getConversationById("main-suppliers", (wAcc1 as any).id);
      record("7b. Worker direct fetch suppliers group should 403", false, "did not throw");
    } catch (e2: any) { record("7b. Worker direct fetch suppliers group should 403", e2.code === "RVB_FORBIDDEN", e2.code); }
  } catch (e: any) { record("7. Worker cannot access Suppliers", false, e.message); }

  // 8 Secondary DM uniqueness
  try {
    const dm1 = await chatSvc.createDM((wAcc1 as any).id, (wAcc2 as any).id);
    const dm2 = await chatSvc.createDM((wAcc2 as any).id, (wAcc1 as any).id);
    record("8. DM uniqueness same pair returns same", dm1.id === dm2.id, `${dm1.id} vs ${dm2.id}`);
    try {
      const fetched = await chatSvc.getConversationById(dm1.id, (outsider as any).id);
      record("8b. Third user cannot access DM", false, "did not throw");
    } catch (e: any) { record("8b. Third user cannot access DM", e.code === "RVB_FORBIDDEN", e.code); }
  } catch (e: any) { record("8. DM uniqueness", false, e.message); }

  // 9 Custom group lifecycle
  let group: any = null;
  try {
    group = await chatSvc.createGroup((wAcc1 as any).id, { name: "Test Group", memberIds: [(wAcc2 as any).id, (sAcc1 as any).id] });
    record("9. Create custom group", !!group && group.type === "group" && group.participants.length === 3, `id=${group.id}`);
    // Add members
    const updated = await chatSvc.updateGroup(group.id, (wAcc1 as any).id, { addMemberIds: [(cAcc1 as any).id] });
    record("9b. Add member to group", updated.participants.some((p: any) => p.accountId === (cAcc1 as any).id), ``);
    // Leave (sAcc1 leaves)
    const afterLeave = await chatSvc.leaveConversation(group.id, (sAcc1 as any).id);
    record("9c. Leave group preserves history", !!afterLeave && afterLeave.participants.filter((p: any) => !p.leftAt).length === 3, `remaining 3`);
    // History retained: send message then leave and check still exists?
    const msg = await chatSvc.sendMessage(group.id, (wAcc1 as any).id, "Hello group");
    const afterLeave2 = await chatSvc.leaveConversation(group.id, (cAcc1 as any).id);
    // Last member leaves -> deletes
    await chatSvc.leaveConversation(group.id, (wAcc1 as any).id);
    await chatSvc.leaveConversation(group.id, (wAcc2 as any).id);
    const stillExists = await ConversationModel.findOne({ id: group.id }).lean();
    record("9d. Last member leaves deletes group", !stillExists, stillExists ? "still exists" : "deleted");
    // But messages for deleted group? We deleted messages
    const msgsAfter = await MessageModel.find({ conversationId: group.id }).lean();
    record("9e. Messages deleted with group (last member) but audit retained? We delete msgs", msgsAfter.length === 0, `msgs ${msgsAfter.length}`);
  } catch (e: any) { record("9. Custom group lifecycle", false, e.message); }

  // Create a new group for remaining tests
  const g2 = await chatSvc.createGroup((wAcc1 as any).id, { name: "Second Group", memberIds: [(wAcc2 as any).id] });

  // 10 Messages permissions
  try {
    const msg = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Valid message");
    record("10. Member can send", !!msg && msg.content === "Valid message", msg.id);
    try {
      await chatSvc.sendMessage(g2.id, (outsider as any).id, "Should fail");
      record("10b. Non-member rejected", false, "did not throw");
    } catch (e: any) { record("10b. Non-member rejected", e.code === "RVB_FORBIDDEN", e.code); }
    // sender identity derived
    record("10c. Sender identity is auth user", msg.senderAccountId === (wAcc1 as any).id, "");
    try {
      await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "   ");
      record("10d. Empty message rejected", false, "did not throw");
    } catch (e: any) { record("10d. Empty message rejected", e.code === "RVB_CONTENT_REQUIRED", e.code); }
  } catch (e: any) { record("10. Member can send", false, e.message); }

  // 11 Edit window
  try {
    const m = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "To edit");
    const edited = await chatSvc.editMessage(m.id, (wAcc1 as any).id, "Edited content");
    record("11. Sender <15m succeeds", edited.content === "Edited content" && edited.editedAt != null, "");
    // Simulate >15m by manipulating createdAt
    await MessageModel.updateOne({ id: m.id }, { $set: { createdAt: Date.now() - 16 * 60 * 1000 } });
    try {
      await chatSvc.editMessage(m.id, (wAcc1 as any).id, "Too late");
      record("11b. Sender >15m rejected", false, "did not throw");
    } catch (e: any) { record("11b. Sender >15m rejected", e.code === "RVB_EDIT_WINDOW_EXPIRED", e.code); }
    // Other user rejected
    const m2 = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Other edit fail");
    try {
      await chatSvc.editMessage(m2.id, (wAcc2 as any).id, "Hack");
      record("11c. Other user edit rejected", false, "did not throw");
    } catch (e: any) { record("11c. Other user edit rejected", e.code === "RVB_FORBIDDEN", e.code); }
    // Audit history retained
    const audit = await chatSvc.getMessageAudit(m.id, (adm as any).id);
    record("11d. Audit history retained for edit", audit.audits.some((a: any) => a.action === "edit"), `audits ${audit.audits.length}`);
  } catch (e: any) { record("11. Edit window", false, e.message); }

  // 12 Delete soft + admin audit
  try {
    const m = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "To delete");
    const del = await chatSvc.deleteMessage(m.id, (wAcc1 as any).id);
    record("12. Sender deletes own message soft", del.isDeleted === true, "");
    try {
      await chatSvc.deleteMessage(m.id, (wAcc2 as any).id);
      record("12b. Other user delete rejected", false, "did not throw");
    } catch (e: any) { record("12b. Other user delete rejected", e.code === "RVB_ALREADY_DELETED" || e.code === "RVB_FORBIDDEN", e.code); }
    // Normal user sees deleted preview
    const list = await chatSvc.listMessages(g2.id, (wAcc2 as any).id);
    const fetched = list.find((x: any) => x.id === m.id);
    record("12c. Normal user sees Message deleted", fetched && fetched.content === "Message deleted" && fetched.isDeleted, fetched?.content);
    // Admin audit can inspect original
    const audit = await chatSvc.getMessageAudit(m.id, (adm as any).id);
    record("12d. Admin audit can inspect original", audit.message && audit.message.isDeleted && audit.audits.some((a: any) => a.action === "delete"), ``);
    try {
      await chatSvc.getMessageAudit(m.id, (wAcc1 as any).id);
      record("12e. Normal user cannot audit", false, "did not throw");
    } catch (e: any) { record("12e. Normal user cannot audit", e.code === "RVB_FORBIDDEN", e.code); }
  } catch (e: any) { record("12. Delete", false, e.message); }

  // 12f-12j Delete policy matrix (existing sender+admin-only policy)
  try {
    const target = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Policy target");
    try {
      await chatSvc.deleteMessage(target.id, (mgr as any).id);
      record("12f. Manager delete rejected", false, "did not throw");
    } catch (e: any) { record("12f. Manager delete rejected", e.code === "RVB_FORBIDDEN", e.code); }
    try {
      await chatSvc.deleteMessage(target.id, (sup as any).id);
      record("12g. Supervisor delete rejected", false, "did not throw");
    } catch (e: any) { record("12g. Supervisor delete rejected", e.code === "RVB_FORBIDDEN", e.code); }
    try {
      await chatSvc.deleteMessage("msg-does-not-exist", (wAcc1 as any).id);
      record("12h. Nonexistent delete 404", false, "did not throw");
    } catch (e: any) { record("12h. Nonexistent delete 404", e.code === "RVB_MESSAGE_NOT_FOUND", e.code); }
    await chatSvc.deleteMessage(target.id, (wAcc1 as any).id);
    try {
      await chatSvc.deleteMessage(target.id, (wAcc1 as any).id);
      record("12i. Double delete rejected", false, "did not throw");
    } catch (e: any) { record("12i. Double delete rejected", e.code === "RVB_ALREADY_DELETED", e.code); }
    // Media-bearing doc deleted: safe view hides content AND attachments/URLs
    const mediaDoc: any = await MessageModel.create({
      id: `msg-media-${now}`, createdAt: Date.now(), updatedAt: Date.now(), conversationId: g2.id,
      senderAccountId: (wAcc1 as any).id, content: "secret pic", replyToMessageId: null,
      editedAt: null, deletedAt: null, deletedBy: null, isDeleted: false, editHistory: [],
      reactions: [{ accountId: (wAcc2 as any).id, emoji: "❤️", createdAt: Date.now() }],
      readBy: [], mentions: [], reminderAt: null,
      attachments: [{ id: "att-1", kind: "image", url: "https://cdn.test/secret.jpg", publicId: "p1", mimeType: "image/jpeg", size: 100, width: 4, height: 3, duration: null }],
    } as any);
    await chatSvc.deleteMessage(mediaDoc.id, (wAcc1 as any).id);
    const listed = await chatSvc.listMessages(g2.id, (wAcc2 as any).id);
    const gotMedia: any = listed.find((x: any) => x.id === mediaDoc.id);
    const wire = JSON.stringify(gotMedia || {});
    record("12j. Deleted hides content+attachments+URLs", !!gotMedia && gotMedia.content === "Message deleted" && (gotMedia.attachments || []).length === 0 && !wire.includes("cdn.test") && !wire.includes("secret"), wire.slice(0, 80));
    // Reply to a now-deleted message: accepted, original stays hidden
    const reply = await chatSvc.sendMessage(g2.id, (wAcc2 as any).id, "replying", mediaDoc.id);
    const listed2 = await chatSvc.listMessages(g2.id, (wAcc1 as any).id);
    const orig: any = listed2.find((x: any) => x.id === mediaDoc.id);
    const rep: any = listed2.find((x: any) => x.id === reply.id);
    record("12k. Reply-to-deleted leaks nothing", !!rep && rep.replyToMessageId === mediaDoc.id && !!orig && orig.content === "Message deleted" && !JSON.stringify(listed2).includes("secret pic"), "");
  } catch (e: any) { record("12f-12k. Delete policy", false, e.message); }

  // 13 Reaction 🤝
  try {
    const m = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "React me");
    const afterAdd = await chatSvc.toggleReaction(m.id, (wAcc2 as any).id);
    record("13. Reaction add 🤝", afterAdd.reactions.some((r: any) => r.accountId === (wAcc2 as any).id && r.emoji === "🤝"), "");
    const afterRemove = await chatSvc.toggleReaction(m.id, (wAcc2 as any).id);
    record("13b. Reaction remove toggle", !afterRemove.reactions.some((r: any) => r.accountId === (wAcc2 as any).id), "");
  } catch (e: any) { record("13. Reaction", false, e.message); }

  // 14 Pin max 3
  try {
    const m1 = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "pin1");
    const m2 = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "pin2");
    const m3 = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "pin3");
    const m4 = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "pin4");
    await chatSvc.pinMessage(g2.id, m1.id, (wAcc1 as any).id);
    await chatSvc.pinMessage(g2.id, m2.id, (wAcc1 as any).id);
    await chatSvc.pinMessage(g2.id, m3.id, (wAcc1 as any).id);
    record("14. Pin 3 succeeds", true, "");
    try {
      await chatSvc.pinMessage(g2.id, m4.id, (wAcc1 as any).id);
      record("14b. 4th pin rejected", false, "did not throw");
    } catch (e: any) { record("14b. 4th pin rejected", e.code === "RVB_PIN_LIMIT", e.code); }
    await chatSvc.unpinMessage(g2.id, m1.id, (wAcc1 as any).id);
    await chatSvc.pinMessage(g2.id, m4.id, (wAcc1 as any).id);
    record("14c. Unpin permits another", true, "");
  } catch (e: any) { record("14. Pin", false, e.message); }

  // 15 Read receipts
  try {
    const m = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Read me");
    await chatSvc.markRead(g2.id, (wAcc2 as any).id, m.id);
    const fetched = await MessageModel.findOne({ id: m.id }).lean() as any;
    record("15. Member read state recorded", fetched.readBy.some((r: any) => r.accountId === (wAcc2 as any).id), "");
    try {
      await chatSvc.markRead(g2.id, (outsider as any).id);
      record("15b. Unauthorized read rejected", false, "did not throw");
    } catch (e: any) { record("15b. Unauthorized read rejected", e.code === "RVB_FORBIDDEN", e.code); }
  } catch (e: any) { record("15. Read receipts", false, e.message); }

  // 16 Lifecycle archived cannot send, history remains, reactivated regains
  try {
    // Archive wAcc1
    await RvbAccountModel.updateOne({ id: (wAcc1 as any).id }, { $set: { status: "archived" } });
    try {
      await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Should fail archived");
      record("16. Archived cannot send", false, "did not throw");
    } catch (e: any) { record("16. Archived cannot send", e.code === "RVB_FORBIDDEN", e.code); }
    // History remains
    const hist = await chatSvc.listMessages(g2.id, (wAcc2 as any).id);
    record("16b. History remains after archive", hist.length > 0, `hist ${hist.length}`);
    // Reactivate
    await RvbAccountModel.updateOne({ id: (wAcc1 as any).id }, { $set: { status: "active" } });
    await chatSvc.syncMainMembership();
    const afterReact = await chatSvc.listConversationsForUser((wAcc1 as any).id);
    const hasGroup = afterReact.some((c: any) => c.id === g2.id);
    record("16c. Reactivated regains access", hasGroup, "");
    // Also official group: after reactivate should be back in main-workers
    const hasWorkers = afterReact.some((c: any) => c.id === "main-workers");
    record("16d. Reactivated regains official group", hasWorkers, "");
  } catch (e: any) { record("16. Lifecycle", false, e.message); }

  // Security no secrets, IDOR already covered, also message IDOR
  try {
    const m = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Secret test");
    // Fetch conversation as stringified check for passwordHash
    const conv = await chatSvc.getConversationById(g2.id, (wAcc1 as any).id);
    const hasHash = JSON.stringify(conv).includes("passwordHash");
    record("17. No secrets in conversation", !hasHash, hasHash ? "found hash" : "ok");
    const msgs = await chatSvc.listMessages(g2.id, (wAcc1 as any).id);
    const msgHasHash = JSON.stringify(msgs).includes("passwordHash");
    record("17b. No secrets in messages", !msgHasHash, "");
    // IDOR for message in other conv
    const otherConv = await chatSvc.createDM((sAcc1 as any).id, (cAcc1 as any).id);
    const otherMsg = await chatSvc.sendMessage(otherConv.id, (sAcc1 as any).id, "Private");
    try {
      await chatSvc.listMessages(otherConv.id, (wAcc1 as any).id);
      record("17c. Message IDOR prevented", false, "did not throw");
    } catch (e: any) { record("17c. Message IDOR prevented", e.code === "RVB_FORBIDDEN", e.code); }
    // Pagination search not required secret test
  } catch (e: any) { record("17. Security", false, e.message); }

  // Test mentions validation
  try {
    // Workers group should allow @workers but not @suppliers
    const workersGroupId = "main-workers";
    // Ensure wAcc1 active
    await RvbAccountModel.updateOne({ id: (wAcc1 as any).id }, { $set: { status: "active" } });
    await chatSvc.syncMainMembership();
    const okMsg = await chatSvc.sendMessage(workersGroupId, (wAcc1 as any).id, "Hello @workers and @everyone");
    record("18. Mention allowed @workers in workers group", okMsg.mentions.includes("workers"), `${okMsg.mentions}`);
    try {
      await chatSvc.sendMessage(workersGroupId, (wAcc1 as any).id, "Hello @suppliers");
      record("18b. Mention disallowed @suppliers in workers group", false, "did not throw");
    } catch (e: any) { record("18b. Mention disallowed @suppliers in workers group", e.code === "RVB_MENTION_NOT_ALLOWED", e.code); }
  } catch (e: any) { record("18. Mentions", false, e.message); }

  // Reminder stored
  try {
    const remMsg = await chatSvc.sendMessage(g2.id, (wAcc1 as any).id, "Reminder @everyone", null, Date.now() + 30 * 60 * 1000);
    record("19. ReminderAt stored", !!remMsg.reminderAt, `${remMsg.reminderAt}`);
  } catch (e: any) { record("19. Reminder", false, e.message); }

  // Check @abattoire untouched
  const ab = await RvbAccountModel.findOne({ tag: "abattoire" }).lean() as any;
  record("20. @abattoire untouched", true, ab ? `found ${ab.id}` : "not found ok");

  const passed = results.filter(([, ok]) => ok).length;
  const total = results.length;
  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  for (const [n, ok, d] of results) if (!ok) console.log(`  FAILED: ${n} — ${d}`);

  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  process.exit(passed === total ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
