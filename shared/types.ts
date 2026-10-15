export type Role = "teacher" | "student";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  rollNumber?: string;
}

export interface Requirement {
  id: string;
  label: string;
  type: "tag" | "attribute" | "text" | "file";
  value: string;
  attribute?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  maxMarks: number;
  requirements: Requirement[];
}

export interface Lab {
  id: string;
  revision?: number;
  title: string;
  description: string;
  /** ISO date-time, or an empty string when no deadline is set. */
  dueDate: string;
  totalMarks: number;
  published: boolean;
  tasks: Task[];
  instructionFile?: { name: string; content: string; contentType: string };
}

export interface Submission {
  id: string;
  studentId: string;
  labId: string;
  taskId: string;
  files: { path: string; content: string }[];
  sourceOmitted?: boolean;
  assets?: { path: string; mimeType: string }[];
  link: string | null;
  submittedAt: string;
  status: "submitted" | "graded";
  revision: number;
  late: boolean;
  grade?: {
    marks: number;
    feedback: string;
    published: boolean;
    gradedAt: string;
  };
}

export interface Activity {
  id: string;
  text: string;
  time: string;
  type: "submission" | "grade" | "lab";
}

export interface AppState {
  user: User | null;
  students: User[];
  labs: Lab[];
  submissions: Submission[];
  activity: Activity[];
  demo: boolean;
}

export interface AnalysisResult {
  evidenceVersion?: string;
  requirements: {
    id: string;
    label: string;
    passed: boolean;
    detail: string;
  }[];
  met: number;
  total: number;
  similarities: {
    studentId: string;
    submissionId: string;
    percentage: number;
    sourceCoverage: number;
    peerCoverage: number;
    comparable: boolean;
    matchingBlocks: { source: string; peer: string }[];
  }[];
  quality: { severity: "info" | "warning"; title: string; detail: string }[];
  summary: string;
}

export interface TaskAnalysis {
  evidenceVersion?: string;
  taskId: string;
  submissions: { submissionId: string; revision: number; met: number; total: number; qualityCount: number; comparable: boolean }[];
  pairs: { leftId: string; rightId: string; percentage: number; sourceCoverage: number; peerCoverage: number; comparable: boolean }[];
  notices: string[];
}
