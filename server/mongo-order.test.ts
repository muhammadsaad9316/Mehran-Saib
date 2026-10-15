import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient, type Db } from "mongodb";
import { Store } from "./store.js";

test("MongoDB migrates legacy activity order and restores positions after a differently ordered restart", async (t) => {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const activity = new Map([
    ["old", { _id: "old", text: "Old", type: "lab", time: "2026-01-01T00:00:00Z" }],
    ["recent", { _id: "recent", text: "Recent", type: "lab", time: "2026-01-02T00:00:00Z" }],
  ]);
  collections.set("activity", activity);
  let reverse = false;
  const database = { collection: (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    const records = collections.get(name)!;
    return {
      find: () => ({ toArray: async () => { const items = [...records.values()].map(item => ({ ...item })); return reverse ? items.reverse() : items; } }),
      bulkWrite: async (operations: { replaceOne: { replacement: Record<string, unknown> } }[]) => {
        for (const operation of operations) records.set(String(operation.replaceOne.replacement._id), { ...operation.replaceOne.replacement });
      },
      deleteMany: async (filter: { _id: { $in: string[] } }) => { filter._id.$in.forEach(id => records.delete(id)); },
    };
  } } as unknown as Db;
  t.mock.method(MongoClient.prototype, "connect", async function (this: MongoClient) { return this; });
  t.mock.method(MongoClient.prototype, "db", () => database);
  t.mock.method(MongoClient.prototype, "close", async () => {});
  t.mock.method(MongoClient.prototype, "withSession", async (callback: (session: unknown) => Promise<unknown>) => callback({ withTransaction: async (operation: () => Promise<unknown>) => operation() }));
  const first = new Store("unused", "mongodb://127.0.0.1/isolated-fixture");
  await first.open();
  assert.deepEqual(first.data.activity.map(item => item.id), ["recent", "old"]);
  await first.mutate(data => data.activity.unshift({ id: "new", text: "New", type: "lab", time: "2026-01-03T00:00:00Z" }));
  await first.close();
  reverse = true;
  const reopened = new Store("unused", "mongodb://127.0.0.1/isolated-fixture");
  await reopened.open();
  assert.deepEqual(reopened.data.activity.map(item => item.id), ["new", "recent", "old"]);
  assert.ok(!JSON.stringify(reopened.data).includes("_labtrackPosition"));
  await reopened.close();
});
