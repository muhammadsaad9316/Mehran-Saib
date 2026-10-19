// These are deliberately public showcase credentials, never classroom accounts.
export const publicDemoLogins = {
  teacher: { email: "teacher@demo.labtrack.app", password: "LabTrackTeacher2026!" },
  student: { email: "student@demo.labtrack.app", password: "LabTrackStudent2026!" },
} as const;

export function isPublicDemoEmail(email: string) {
  const value = email.trim().toLowerCase();
  return Object.values(publicDemoLogins).some(login => login.email === value);
}
