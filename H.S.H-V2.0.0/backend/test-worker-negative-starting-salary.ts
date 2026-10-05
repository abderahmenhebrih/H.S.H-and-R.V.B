import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerEditOperation } from "../frontend/src/services/operations/worker-edit.operation";
import { formatCurrency } from "../frontend/src/lib/settings";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function expectReject(fn: () => Promise<unknown>, expectedMsg: string, label: string) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(
      msg === expectedMsg,
      `${label}: wrong error. Expected "${expectedMsg}", got "${msg}"`,
    );
    console.log(`${label} rejected as expected (${msg}).`);
    return;
  }
  throw new Error(`${label}: expected rejection but was accepted.`);
}

async function main() {
  try {
    await db.delete();
  } catch {}
  await db.open();
  const now = Date.now();

  // 1. startingSalary = -500 → accepted, balance = -500 exactly
  const neg500 = await workerService.create({
    name: `__TEST_NEG500_${now}__`,
    phone: "0000000500",
    employmentDate: now,
    position: "Butcher",
    startingSalary: -500,
    monthlySalary: 3000,
  });
  let cur = await db.workers.get(neg500.id);
  assert(cur?.startingSalary === -500, `CREATE -500: startingSalary got ${cur?.startingSalary}`);
  assert(cur?.balance === -500, `CREATE -500: balance got ${cur?.balance} (must equal signed opening amount)`);
  console.log("1. create startingSalary=-500 accepted, balance=-500 PASS");

  // 2. startingSalary = -1 → accepted
  const neg1 = await workerService.create({
    name: `__TEST_NEG1_${now}__`,
    phone: "0000000001",
    employmentDate: now,
    position: "Driver",
    startingSalary: -1,
    monthlySalary: 2000,
  });
  cur = await db.workers.get(neg1.id);
  assert(cur?.startingSalary === -1, `CREATE -1: got ${cur?.startingSalary}`);
  console.log("2. create startingSalary=-1 accepted PASS");

  // 3. startingSalary = 0 → accepted
  const zero = await workerService.create({
    name: `__TEST_ZERO_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Helper",
    startingSalary: 0,
    monthlySalary: 2000,
  });
  cur = await db.workers.get(zero.id);
  assert(cur?.startingSalary === 0 && cur?.balance === 0, "CREATE 0 failed");
  console.log("3. create startingSalary=0 accepted PASS");

  // 4. startingSalary = 500 → accepted (backward compat)
  const pos = await workerService.create({
    name: `__TEST_POS500_${now}__`,
    phone: "0000000501",
    employmentDate: now,
    position: "Manager",
    startingSalary: 500,
    monthlySalary: 4000,
  });
  cur = await db.workers.get(pos.id);
  assert(cur?.startingSalary === 500 && cur?.balance === 500, "CREATE 500 failed");
  console.log("4. create startingSalary=500 accepted PASS");

  // 5. monthlySalary positive → accepted (covered above)

  // 6. monthlySalary negative → rejected, policy preserved
  await expectReject(
    () =>
      workerService.create({
        name: `__TEST_NEGMONTH_${now}__`,
        phone: "0000000002",
        employmentDate: now,
        position: "Butcher",
        startingSalary: 100,
        monthlySalary: -100,
      }),
    "Worker monthly salary cannot be negative.",
    "6. monthlySalary=-100",
  );

  // 7. invalid startingSalary (NaN) → rejected
  await expectReject(
    () =>
      workerService.create({
        name: `__TEST_NAN_${now}__`,
        phone: "0000000003",
        employmentDate: now,
        position: "Butcher",
        startingSalary: NaN,
        monthlySalary: 1000,
      }),
    "Worker starting salary must be a valid number.",
    "7. startingSalary=NaN",
  );
  // 7b. Infinity → rejected
  await expectReject(
    () =>
      workerService.create({
        name: `__TEST_INF_${now}__`,
        phone: "0000000004",
        employmentDate: now,
        position: "Butcher",
        startingSalary: Infinity,
        monthlySalary: 1000,
      }),
    "Worker starting salary must be a valid number.",
    "7b. startingSalary=Infinity",
  );

  // 8. EDIT positive → negative
  await workerEditOperation.edit({
    workerId: pos.id,
    name: pos.name,
    phone: pos.phone,
    employmentDate: pos.employmentDate,
    position: pos.position,
    startingSalary: -500,
    monthlySalary: 4000,
  });
  cur = await db.workers.get(pos.id);
  assert(cur?.startingSalary === -500, `EDIT pos→neg: got ${cur?.startingSalary}`);
  assert(cur?.balance === 500, `EDIT must preserve balance (500), got ${cur?.balance}`);
  console.log("8. edit positive→negative PASS (balance preserved)");

  // 9. EDIT negative → positive
  await workerEditOperation.edit({
    workerId: neg500.id,
    name: neg500.name,
    phone: neg500.phone,
    employmentDate: neg500.employmentDate,
    position: neg500.position,
    startingSalary: 250,
    monthlySalary: 3000,
  });
  cur = await db.workers.get(neg500.id);
  assert(cur?.startingSalary === 250, `EDIT neg→pos: got ${cur?.startingSalary}`);
  assert(cur?.balance === -500, `EDIT must preserve balance (-500), got ${cur?.balance}`);
  console.log("9. edit negative→positive PASS (balance preserved)");

  // 9b. EDIT monthly negative → still rejected
  await expectReject(
    () =>
      workerEditOperation.edit({
        workerId: neg1.id,
        name: neg1.name,
        phone: neg1.phone,
        employmentDate: neg1.employmentDate,
        position: neg1.position,
        startingSalary: -1,
        monthlySalary: -5,
      }),
    "Monthly salary cannot be negative.",
    "9b. edit monthlySalary=-5",
  );

  // 10. negative remains after reload (close/reopen DB)
  const reloadTarget = await workerService.create({
    name: `__TEST_RELOAD_${now}__`,
    phone: "0000000505",
    employmentDate: now,
    position: "Butcher",
    startingSalary: -500,
    monthlySalary: 3000,
  });
  db.close();
  await db.open();
  cur = await db.workers.get(reloadTarget.id);
  assert(cur?.startingSalary === -500, `RELOAD: startingSalary got ${cur?.startingSalary}`);
  assert(cur?.balance === -500, `RELOAD: balance got ${cur?.balance}`);
  console.log("10. negative remains after reload PASS");

  // 13. worker profile display shows "-500 DA" (sign preserved, not clamped/abs)
  const shown = formatCurrency(Number(cur?.balance), "DA");
  assert(shown === "-500.00 DA", `DISPLAY: got "${shown}", expected "-500.00 DA"`);
  console.log(`13. profile display "${shown}" PASS`);

  // 15/16. balance incorporates signed opening amount, no abs conversion
  assert(cur!.balance < 0 && Object.is(cur!.balance, -500), "BALANCE sign/exactness failed");
  console.log("15/16. balance preserves sign, no abs conversion PASS");

  // 17. no Loan/financial record auto-created: creation touches only workers (+sync queue),
  // never payments/transfers. Verify none reference the new worker.
  const strayPayments = await db.payments.where("entityId").equals(reloadTarget.id).toArray();
  assert(strayPayments.length === 0, `AUTO-LOAN: found ${strayPayments.length} payment(s) for new worker`);
  const strayTransfers = await db.transfers
    .filter((t: any) => t.fromAccountId === reloadTarget.id || t.toAccountId === reloadTarget.id)
    .toArray();
  assert(strayTransfers.length === 0, "AUTO-LOAN: found transfer(s) for new worker");
  console.log("17. no auto-created Loan/payment/transfer record PASS");

  console.log("Worker negative starting salary test passed.");
  db.close();
}

main().catch((e) => {
  console.error("Worker negative starting salary test failed.");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
