import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Lab, Requirement } from "../shared/types.js";
import { Store } from "./store.js";
import { SupabasePersistence } from "./supabase.js";
import { stableJson } from "./serialization.js";
import { labMetadata } from "./lab-instructions.js";

export const labFourDocumentHash = "21bc32cc4bba91d212012fa8bb8886832d44d69e95ff044b63182a8cb126a0d8";

export async function labFourAssignment(): Promise<Lab> {
  const document = await readFile(new URL("./fixtures/Web Engineering lab 4.docx", import.meta.url));
  if (createHash("sha256").update(document).digest("hex") !== labFourDocumentHash)
    throw new Error("The Lab 4 attachment differs from the supplied assignment. No records were changed.");
  const tag = (id: string, label: string, value: string): Requirement => ({ id, label, type: "tag", value });
  const page = (id: string): Requirement => ({ id, label: "HTML page uploaded (any filename)", type: "file", value: "*.html" });
  return {
    id: "lab4", revision: 1, title: "HTML5 layout & student registration forms",
    description: "Lab 04 · Build a university home page using HTML5 layout elements and a student registration form. Save each task in a separate HTML file, test it in a browser, and submit each task separately. Any HTML/HTM filename is accepted. The original assignment is attached. 10 marks per task; no deadline.",
    dueDate: "", totalMarks: 20, published: true,
    instructionFile: { name: "Web Engineering lab 4.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content: document.toString("base64"), sha256: labFourDocumentHash },
    tasks: [
      {
        id: "lab4-task1", title: "University Home Page", maxMarks: 10,
        description: `Objective: Create a simple university webpage using HTML5 layout elements and block and inline elements.

1. Add a university name inside a <header>.
2. Create navigation links using <nav> for Home, Departments, and Contact.
3. Use <section> to display university information.
4. Use <article> to display the university's vision and mission.
5. Use <aside> to display university news.
6. Add contact information and copyright text inside a <footer>.
7. Use <div> and <span> to organize and style content.

Save this task in its own HTML file (for example, task1.html; any HTML/HTM filename is accepted). Open it in a web browser to test and verify the output before submitting.

The checklist checks structural evidence only. The teacher reviews the university name, meaningful content in each layout element, Home/Departments/Contact navigation, vision and mission, news, footer contact/copyright information, and use of block and inline elements.`,
        requirements: [
          page("l4t1-file"),
          ...["header", "nav", "section", "article", "aside", "footer", "div", "span"].map(name => tag(`l4t1-${name}`, `${name} element present`, `body ${name}`)),
          { id: "l4t1-navigation", label: "Navigation link has a destination", type: "attribute", value: "body nav a", attribute: "href" },
          ...["Home", "Departments", "Contact"].map(value => ({ id: `l4t1-${value.toLowerCase()}`, label: `${value} text present`, type: "text" as const, value })),
        ],
      },
      {
        id: "lab4-task2", title: "Student Registration Form", maxMarks: 10,
        description: `Objective: Create an HTML form to collect student registration information.

1. Add fields for student name, email, password, date of birth, and phone number.
2. Use radio buttons to select gender.
3. Use checkboxes to select interests or skills.
4. Use a dropdown list to select a department.
5. Add a <textarea> for the student's address. Make it required and limit it to 20 characters with maxlength="20".
6. Group related fields using <fieldset> and <legend>.
7. Add Submit and Reset buttons.
8. Use required, placeholder, and maxlength where appropriate.

Save this task in a separate HTML file (for example, task2.html; any HTML/HTM filename is accepted). Test and verify it in a web browser before submitting. This exercise creates the form interface; a backend that saves registrations is not required by the document.

The checklist checks structural evidence only. The teacher reviews field labels and meaning, shared names for gender radio buttons, checkbox choices, department options, field grouping, appropriate validation attributes, and Submit/Reset behavior.`,
        requirements: [
          page("l4t2-file"),
          tag("l4t2-form", "Form element present", "body form"),
          tag("l4t2-name", "Text input present for student name", 'form input[type="text" i], form input:not([type])'),
          ...["email", "password", "date", "tel", "radio", "checkbox"].map(type => tag(`l4t2-${type}`, `${type} input present`, `form input[type="${type}" i]`)),
          tag("l4t2-department", "Dropdown with an option present", "form select option"),
          tag("l4t2-address", "Required address textarea limited to 20 characters", 'form textarea[required][maxlength="20"]'),
          tag("l4t2-group", "Fieldset with a legend present", "form fieldset > legend"),
          tag("l4t2-submit", "Submit control present", 'form input[type="submit" i], form button[type="submit" i], form button:not([type])'),
          tag("l4t2-reset", "Reset control present", 'form input[type="reset" i], form button[type="reset" i]'),
          { id: "l4t2-placeholder", label: "Form field has a placeholder", type: "attribute", value: "form input, form textarea", attribute: "placeholder" },
        ],
      },
    ],
  };
}

export async function addLabFour(store: Store): Promise<boolean> {
  const assignment = await labFourAssignment();
  return store.mutate(data => {
    const existing = data.labs.find(lab => lab.id === assignment.id);
    if (existing) {
      if (stableJson(labMetadata(existing)) === stableJson(labMetadata(assignment))) return false;
      throw new Error("Lab 4 already exists with different content. No records were changed.");
    }
    if (data.labs.some(lab => lab.title === assignment.title || /\blab\s*(?:assignment\s*)?#?\s*0?4\b/i.test(`${lab.title} ${lab.description}`)))
      throw new Error("Another Lab 4 record already exists. No records were changed.");
    data.labs.push(assignment);
    return true;
  });
}

async function main() {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !["check", "publish"].includes(command)) throw new Error("Use check or publish.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  if (process.env.MONGODB_URI || process.env.SUPABASE_URL !== "https://akudfcgksdjlipxxwfdu.supabase.co" || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Expected the configured LabTrack classroom Supabase project. No changes made.");
  const config = { url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY };
  const reader = new SupabasePersistence(config);
  const before = await reader.load();
  const store = new Store(path.join(root, ".data"), undefined, { ...config, compact: true });
  await store.open();
  try {
    const changed = command === "publish" ? await addLabFour(store) : false;
    const after = await reader.load();
    const digest = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    const existing = new Set(before.labs.filter(lab => lab.id !== "lab4").map(lab => lab.id));
    const priorLabsUnchanged = digest(before.labs.filter(lab => existing.has(lab.id))) === digest(after.labs.filter(lab => existing.has(lab.id)));
    const otherRecordsUnchanged = digest({ ...before, labs: [] }) === digest({ ...after, labs: [] });
    const saved = after.labs.find(lab => lab.id === "lab4");
    const publishedAsPrepared = !!saved && stableJson(saved) === stableJson(await labFourAssignment());
    console.log(JSON.stringify({ command, changed, priorLabsUnchanged, otherRecordsUnchanged, publishedAsPrepared,
      labs: after.labs.map(({ id, title, published, totalMarks, tasks }) => ({ id, title, published, totalMarks, tasks: tasks.length })) }));
    if (!priorLabsUnchanged || !otherRecordsUnchanged) throw new Error("Classroom records changed during verification. Inspect concurrent activity before taking further action.");
    if (command === "publish" && !publishedAsPrepared) throw new Error("Saved Lab 4 differs from the prepared assignment. Inspect before retrying.");
  } finally { await store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error instanceof Error ? error.message : "Lab 4 operation failed.");
  process.exitCode = 1;
});
