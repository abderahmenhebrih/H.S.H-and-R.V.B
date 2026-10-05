import dotenv from "dotenv";
import readline from "readline";
import { connectDatabase, disconnectDatabase } from "../src/config/database";
import { RvbAccountModel } from "../src/models/rvb-account.model";
import { normalizeTag, isValidTag } from "../src/constants/rvb-account";
import { hashPassword, validatePasswordPolicy } from "../src/lib/password";

dotenv.config();

async function prompt(query: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      // Simple hidden: not truly hidden on Windows but we avoid echoing via stdin raw
      (process.stdout as any).write(query);
      let input = "";
      process.stdin.setRawMode?.(true);
      const onData = (chunk: Buffer) => {
        const char = chunk.toString("utf8");
        if (char === "\n" || char === "\r" || char === "\r\n") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(input);
        } else if (char === "\u0003") {
          process.exit(1);
        } else if (char === "\u007f" || char === "\b") {
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      };
      process.stdin.on("data", onData);
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string) => {
    const idx = args.indexOf(`--${name}`);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    const prefixed = args.find((a) => a.startsWith(`--${name}=`));
    if (prefixed) return prefixed.split("=").slice(1).join("=");
    return undefined;
  };

  let displayName = getArg("displayName") || getArg("name");
  let tag = getArg("tag");
  let password = getArg("password");
  let existingId = getArg("existingId");

  console.log("=== RVB Manager Bootstrap ===");
  console.log("This will create a manager account OR set password for existing manager.\n");

  await connectDatabase();

  try {
    if (!displayName && !existingId) {
      displayName = (await prompt("Display name: ")).trim();
    }
    if (!tag && !existingId) {
      tag = (await prompt("@Tag (without @, e.g. manager01): ")).trim();
    }
    if (tag) {
      const normalized = normalizeTag(tag);
      if (!isValidTag(normalized)) {
        console.error(`Invalid tag "${tag}" -> normalized "${normalized}". Must be 3-30 chars a-z0-9._ start letter/number.`);
        process.exit(1);
      }
      tag = normalized;
    }
    if (!password) {
      password = (await prompt("Password (min 8 chars, hidden input not fully hidden on Windows, ensure privacy): ")).trim();
    }
    const confirm = getArg("confirm") || password;
    // If password provided via CLI, confirm is same; if prompted, we ask again
    let finalConfirm = confirm;
    if (!getArg("password") && !getArg("confirm")) {
      finalConfirm = (await prompt("Confirm password: ")).trim();
    }

    const policyError = validatePasswordPolicy(password || "", finalConfirm);
    if (policyError) {
      console.error(`Password policy error: ${policyError}`);
      process.exit(1);
    }

    if (existingId) {
      const existing: any = await RvbAccountModel.findOne({ id: existingId });
      if (!existing) {
        console.error(`Existing account id ${existingId} not found`);
        process.exit(1);
      }
      if (existing.role !== "manager") {
        console.warn(`Warning: existing role is ${existing.role}, expected manager. Continuing.`);
      }
      existing.passwordHash = await hashPassword(password!);
      existing.mustChangePassword = false;
      existing.passwordChangedAt = Date.now();
      existing.updatedAt = Date.now();
      // Ensure active
      if (existing.status !== "active") {
        existing.status = "active";
        existing.archivedAt = null;
      }
      await existing.save();
      console.log(`\n✓ Password set for existing account: ${existing.displayName} @${existing.tag} (${existing.role})`);
      console.log(`  id: ${existing.id}`);
      console.log(`  mustChangePassword: false (bootstrap password is considered already changed)`);
    } else {
      if (!displayName) {
        console.error("Display name required");
        process.exit(1);
      }
      if (!tag) {
        console.error("Tag required");
        process.exit(1);
      }
      const existingTag = await RvbAccountModel.findOne({ tag }).lean();
      if (existingTag) {
        console.error(`Tag @${tag} already exists (id: ${(existingTag as any).id})`);
        process.exit(1);
      }
      const now = Date.now();
      const hash = await hashPassword(password!);
      const doc: any = {
        id: `rvbacc-${require("uuid").v4()}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: "synced",
        tag,
        displayName: displayName.trim(),
        role: "manager",
        linkedEntityType: null,
        linkedEntityId: null,
        status: "active",
        onboardingStatus: "pending",
        profilePicture: undefined,
        archivedAt: null,
        lastLoginAt: null,
        passwordHash: hash,
        mustChangePassword: false,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };
      const created = await RvbAccountModel.create(doc);
      const out: any = created.toObject ? created.toObject() : created;
      console.log(`\n✓ Manager account created: ${out.displayName} @${out.tag}`);
      console.log(`  id: ${out.id}`);
      console.log(`  role: manager`);
      console.log(`  tag is immutable and unique`);
    }
    console.log("\nDone. You can now login at /rvb/login with this @tag and password.");
  } finally {
    await disconnectDatabase().catch(() => {});
  }
}

main().catch((e) => {
  console.error("Bootstrap failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
