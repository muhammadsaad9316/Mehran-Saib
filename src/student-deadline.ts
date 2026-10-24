import { useEffect, useState } from "react";

export function deadlineRemaining(dueDate: string, now: number): string {
  if (!dueDate) return "No deadline";
  const remaining = Date.parse(dueDate) - now;
  if (remaining <= 0) return "Deadline passed";
  if (remaining < 60000) return "Less than a minute remaining";
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const unit = (value: number, name: string) => `${value} ${name}${value === 1 ? "" : "s"}`;
  const parts = days
    ? [unit(days, "day"), ...(hours ? [unit(hours, "hour")] : [])]
    : hours
      ? [unit(hours, "hour"), ...(minutes ? [unit(minutes, "minute")] : [])]
      : [unit(minutes, "minute")];
  return `${parts.join(" ")} remaining`;
}

export function useDeadlineClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return now;
}
