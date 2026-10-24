import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineRemaining } from "./student-deadline";

test("student countdown handles absent deadlines, units and the deadline boundary", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const remaining = (milliseconds: number) => deadlineRemaining(new Date(now + milliseconds).toISOString(), now);
  assert.equal(deadlineRemaining("", now), "No deadline");
  assert.equal(remaining(44 * 3600000), "1 day 20 hours remaining");
  assert.equal(remaining(48 * 3600000), "2 days remaining");
  assert.equal(remaining(61 * 60000), "1 hour 1 minute remaining");
  assert.equal(remaining(60 * 60000), "1 hour remaining");
  assert.equal(remaining(20 * 60000), "20 minutes remaining");
  assert.equal(remaining(60000), "1 minute remaining");
  assert.equal(remaining(59999), "Less than a minute remaining");
  assert.equal(remaining(0), "Deadline passed");
  assert.equal(remaining(-1), "Deadline passed");
});
