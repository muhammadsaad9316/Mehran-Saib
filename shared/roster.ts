import type { User } from "./types";

export const MAX_ROLL_NUMBER = 41;
export function canonicalRollNumber(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isInteger(number) && number >= 1 && number <= MAX_ROLL_NUMBER
    ? String(number)
    : null;
}
export function byRollNumber(a: User, b: User) {
  return Number(a.rollNumber) - Number(b.rollNumber);
}
export function renumberLegacyStudents<T extends User>(users: T[]): T[] {
  const students = users.filter((user) => user.role === "student");
  if (students.length > MAX_ROLL_NUMBER)
    throw new Error(
      "The roster contains more than 41 students. Review the roster before renumbering.",
    );
  const valid = students.every(
    (user) => canonicalRollNumber(user.rollNumber) === user.rollNumber,
  );
  const unique =
    new Set(students.map((user) => user.rollNumber)).size === students.length;
  if (valid && unique) return users;
  const ordered = [...students].sort((a, b) => {
    const previous = (user: User) =>
      Number(user.rollNumber?.match(/\d+$/)?.[0] ?? Number.MAX_SAFE_INTEGER);
    return previous(a) - previous(b);
  });
  const numbers = new Map(
    ordered.map((user, index) => [user.id, String(index + 1)]),
  );
  return users.map((user) =>
    user.role === "student"
      ? { ...user, rollNumber: numbers.get(user.id)! }
      : user,
  );
}
