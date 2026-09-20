import assert from "node:assert/strict";
import { test } from "node:test";
import { occurrenceId, atOnDay, spacedTimes, sortTimes } from "./ids.ts";
import {
  applySnoozes,
  canTakeDose,
  dueUnacked,
  nextUpcoming,
  recentTakes,
  remainingLabel,
  watchUpcoming,
  type PlannedDose,
} from "./schedule.ts";
import type { Med } from "./types.ts";

function med(over: Partial<Med> = {}): Med {
  return {
    id: "m1",
    personId: "ja",
    name: "Amora",
    dose: "",
    form: "tablete",
    color: "pine",
    times: ["08:00", "20:00"],
    days: [0, 1, 2, 3, 4, 5, 6],
    notes: "",
    photo: null,
    photos: [],
    stock: 10,
    packSize: null,
    tabletsPerDose: 1,
    expiry: "",
    active: true,
    createdAt: 1,
    ...over,
  };
}

function dose(over: Partial<PlannedDose> = {}): PlannedDose {
  return {
    occurrenceId: "m1:1",
    medId: "m1",
    personId: "ja",
    personName: "Ja",
    name: "Amora",
    dose: "",
    color: "pine",
    tabletsPerDose: 1,
    at: Date.now(),
    ...over,
  };
}

function takenLog(at: number, medId = "m1") {
  return {
    id: occurrenceId(medId, at),
    medId,
    name: "Amora",
    dose: "",
    scheduledAt: at,
    resolvedAt: at,
    result: "taken" as const,
  };
}

test("spacedTimes splits 24h evenly and sorts", () => {
  assert.deepEqual(spacedTimes(1), ["08:00"]);
  assert.deepEqual(spacedTimes(2), ["08:00", "20:00"]);
  assert.deepEqual(spacedTimes(3), ["00:00", "08:00", "16:00"]);
  assert.deepEqual(sortTimes(["20:00", "08:00", "08:00"]), ["08:00", "20:00"]);
});

test("cannot take before the satnica", () => {
  const future = dose({ at: Date.now() + 60 * 60 * 1000 });
  assert.equal(canTakeDose(future), false);
  const due = dose({ at: Date.now() - 1000 });
  assert.equal(canTakeDose(due), true);
});

test("cannot retake a satnica at or before the last take", () => {
  const morning = atOnDay(new Date(2026, 8, 20), "08:00");
  const twoHours = morning + 2 * 60 * 60 * 1000;
  const logs = [takenLog(morning)];
  const same = dose({
    medId: "m1",
    at: morning,
    occurrenceId: occurrenceId("m1", morning),
  });
  assert.equal(canTakeDose(same, twoHours, logs), false);
});

test("unmarking the last take makes that dose due now", () => {
  const day = new Date(2026, 8, 20);
  const slot = atOnDay(day, "22:05");
  const now = atOnDay(day, "22:10");
  const next = nextUpcoming([med({ times: ["08:00", "22:05"] })], [], [], now);
  assert.ok(next);
  assert.equal(next!.at, slot);
  assert.equal(canTakeDose(next!, now, []), true);
});

test("at 22:10 the current dose is tonight 22:05, not Wednesday", () => {
  const day = new Date(2026, 8, 20);
  const now = atOnDay(day, "22:10");
  const slot = atOnDay(day, "22:05");
  const next = nextUpcoming([med({ times: ["08:00", "22:05"] })], [], [], now);
  assert.ok(next);
  assert.equal(next!.at, slot);
  assert.equal(remainingLabel(slot, now), "kasni 5 min");
});

test("empty days mean every day, so next is tomorrow not 71 h later", () => {
  const day = new Date(2026, 8, 20);
  const morning = atOnDay(day, "08:00");
  const evening = atOnDay(day, "22:05");
  const now = atOnDay(day, "22:10");
  const logs = [takenLog(morning), takenLog(evening)];
  const next = nextUpcoming(
    [med({ times: ["08:00", "22:05"], days: [] })],
    logs,
    [],
    now,
  );
  assert.ok(next);
  const tomorrowMorning = atOnDay(new Date(2026, 8, 21), "08:00");
  assert.equal(next!.at, tomorrowMorning);
  assert.ok(next!.at - evening < 12 * 60 * 60 * 1000);
});

test("only the current satnica rings — 08:00 is dropped once 20:00 has arrived", () => {
  const now = atOnDay(new Date(2026, 8, 20), "20:10");
  const due = dueUnacked([med({ times: ["08:00", "20:00"] })], [], [], now);
  assert.equal(due.length, 1);
  assert.equal(due[0].at, atOnDay(new Date(2026, 8, 20), "20:00"));
});

test("snooze keeps the same dose and does not ring immediately", () => {
  const originalAt = atOnDay(new Date(2026, 8, 20), "08:00");
  const now = originalAt + 5 * 60 * 1000;
  const original = dose({
    occurrenceId: occurrenceId("m1", originalAt),
    at: originalAt,
  });
  const snoozed = { ...original, at: now + 15 * 60 * 1000 };
  const merged = applySnoozes([original], [snoozed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].at, snoozed.at);
  const due = dueUnacked([med({ times: ["08:00"] })], [], [snoozed], now);
  assert.equal(due.some((d) => d.occurrenceId === original.occurrenceId), false);
});

test("watchUpcoming skips a taken satnica and keeps the next one", () => {
  const now = new Date(2026, 8, 20, 10, 0, 0).getTime();
  const morning = atOnDay(new Date(2026, 8, 20), "08:00");
  const list = watchUpcoming(
    [med({ times: ["08:00", "20:00"] })],
    [takenLog(morning)],
    [],
    now,
  );
  assert.equal(list.some((d) => d.occurrenceId === occurrenceId("m1", morning)), false);
  assert.equal(list.some((d) => d.at === atOnDay(new Date(2026, 8, 20), "20:00")), true);
});

test("recentTakes lists the last four takes newest first", () => {
  const t0 = atOnDay(new Date(2026, 8, 20), "08:00");
  const logs = [0, 1, 2, 3, 4].map((i) => takenLog(t0 + i * 60 * 60 * 1000));
  const recent = recentTakes(logs, ["m1"], 4);
  assert.equal(recent.length, 4);
  assert.equal(recent[0].scheduledAt, t0 + 4 * 60 * 60 * 1000);
  assert.equal(recent[3].scheduledAt, t0 + 1 * 60 * 60 * 1000);
});

