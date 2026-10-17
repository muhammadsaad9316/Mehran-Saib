import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import type { Lab } from "../shared/types.js";
import { Store } from "./store.js";
import { stableJson } from "./serialization.js";
import { labThreeRequirements } from "../shared/lab-three-checks.js";

export async function labThreeDraft(): Promise<Lab> {
  return {
    id: "lab3", revision: 1,
    title: "CSS, links, animations & tables",
    description: "Lab 03 · CSS styling, hyperlinks, floating images, marquee animations, tables and course lists. Complete and submit each task separately. The original assignment is attached. Any HTML/HTM filename is accepted under the classroom policy. Review the draft before publishing; 10 marks per task, no deadline.",
    dueDate: "", totalMarks: 30, published: false,
    instructionFile: {
      name: "Web Engineering lab 3.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      content: (await readFile(new URL("./fixtures/Web Engineering lab 3.docx", import.meta.url))).toString("base64"),
    },
    tasks: [
      {
        id: "lab3-task1", title: "CSS Styling, Links & Floating Images", maxMarks: 10,
        description: `Objective: Apply inline, internal and external CSS, work with hyperlinks, and float images.

1. File setup: Create an HTML page (the document suggests lab1_styling.html; any HTML/HTM filename is accepted) and an external CSS file named style.css.
2. Inline CSS: Create an <h1> heading with style="color: navy;".
3. Internal CSS: Add a <style> block in <head>. Set body { background-color: lightgray; } and style the a:link, a:hover and a:visited link states.
4. External CSS: Link style.css inside <head>.
5. Links: Add an external link opening in a new tab with target="_blank", and an internal bookmark link with href="#section2" and a matching destination.
6. Floating image: Insert an <img>, wrap text around it using CSS float: left;, and make it clickable by nesting it inside an <a>.

Submit the HTML, style.css and the local image together. The checklist confirms structural evidence; the teacher reviews CSS values, link behavior and text wrapping.`,
        requirements: labThreeRequirements(1),
      },
      {
        id: "lab3-task2", title: "Marquee Text & Image Animations", maxMarks: 10,
        description: `Objective: Create moving text and images using <marquee> with different behaviors and directions.

1. File setup: Create an HTML page (the document suggests lab2_marquee.html; any HTML/HTM filename is accepted).
2. Continuous text: Add a left-scrolling text banner with behavior="scroll" and direction="left".
3. Bouncing and sliding text: Add a bouncing line with behavior="alternate" and a slide-in line with behavior="slide".
4. Vertical box: Create a styled marquee box with height: 200px; width: 300px; border: 2px solid black; and direction="up".
5. Image animation: Put an <img> inside a <marquee> to scroll the image.

Submit the HTML and local image together. Use <marquee> as specified in this assignment. The teacher reviews the actual animation, text, box dimensions and border.`,
        requirements: labThreeRequirements(2),
      },
      {
        id: "lab3-task3", title: "Tables & Course Lists", maxMarks: 10,
        description: `Objective: Build structured data tables with <table>, <tr>, <th>, <td>, colspan and rowspan, and organize information using HTML lists.

1. File setup: Create an HTML page (the document suggests lab3_tables_lists.html; any HTML/HTM filename is accepted).
2. Table: Create a centered table with a border. Add a header row using <th> for Student ID, Name, Department and GPA. Include 3 data rows using <td>. Merge cells using colspan or rowspan.
3. Lists: Use the practice content below and apply all three formatting rules.

Core Subjects:
1. OOP
2. Web Engineering
3. Database Systems

Web Technologies:
• HTML5
  a. Headings
  b. Tables
• CSS3

Term Definitions:
• HTML: HyperText Markup Language
• CSS: Cascading Style Sheets

Formatting rules:
• Core Subjects: Use an ordered list with <ol type="I"> (Roman numerals).
• Web Technologies: Use a nested list combining <ul> with list-style-type: square and <ol type="a"> for the Headings and Tables items under HTML5.
• Term Definitions: Use a description list with <dl>, <dt> and <dd>.

The teacher reviews table centering, borders, headers, all 3 data rows, meaningful merged cells, exact list content, nesting and list markers.`,
        requirements: labThreeRequirements(3),
      },
    ],
  };
}

export async function addLabThree(store: Store): Promise<boolean> {
  const draft = await labThreeDraft();
  return store.mutate(data => {
    const existing = data.labs.find(lab => lab.id === draft.id);
    if (existing) {
      if (stableJson(existing) === stableJson(draft)) return false;
      throw new Error("Lab 3 already exists with different content. No labs were changed.");
    }
    if (data.labs.some(lab => lab.title === draft.title || /\blab\s*(?:assignment\s*)?#?\s*0?3\b/i.test(lab.title + " " + lab.description)))
      throw new Error("Another Lab 3 record already exists. No labs were changed.");
    data.labs.push(draft);
    return true;
  });
}

export async function upgradeLabThreeChecks(store: Store): Promise<boolean> {
  const expected = structuredClone(store.data.labs.find(lab => lab.id === "lab3"));
  const source = await labThreeDraft();
  if(!expected || expected.instructionFile?.content !== source.instructionFile?.content ||
    expected.tasks.length !== 3 || source.tasks.some((task,index) => expected.tasks[index].id !== task.id))
    throw new Error("The saved Lab 3 does not match the supplied assignment. No records were changed.");
  return store.mutate(data => {
    const lab=data.labs.find(item=>item.id===expected.id);
    if(!lab || stableJson(lab)!==stableJson(expected))throw new Error("Lab 3 changed during preparation. Refresh before upgrading its checks.");
    if(lab.tasks.every((task,index)=>stableJson(task.requirements)===stableJson(source.tasks[index].requirements)))return false;
    lab.tasks=lab.tasks.map((task,index)=>({...task,requirements:structuredClone(source.tasks[index].requirements)}));
    lab.revision=(lab.revision??0)+1;
    return true;
  });
}

async function main() {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !["check", "apply", "upgrade-checks"].includes(command)) throw new Error("Use check, apply or upgrade-checks.");
  const root = fileURLToPath(new URL("../", import.meta.url));
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  if (process.env.MONGODB_URI || process.env.SUPABASE_URL !== "https://akudfcgksdjlipxxwfdu.supabase.co" || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Expected the configured LabTrack classroom Supabase project. No changes made.");
  const store = new Store(path.join(root, ".data"), undefined, { url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY, compact: true });
  await store.open();
  try {
    const digest = (value: unknown) => createHash("sha256").update(stableJson(value)).digest("hex");
    const original = new Map(store.data.labs.filter(lab=>command!=="upgrade-checks"||lab.id!=="lab3").map(lab => [lab.id, digest(lab)]));
    const unchangedLabFields=(lab:Lab|undefined)=>lab?{...lab,revision:undefined,tasks:lab.tasks.map(({requirements:_,...task})=>task)}:undefined;
    const originalLabFields=command==="upgrade-checks"?digest(unchangedLabFields(store.data.labs.find(lab=>lab.id==="lab3"))):"";
    const beforeHash = digest({ ...store.data, labs: store.data.labs.filter(lab => lab.id !== "lab3") });
    const changed = command === "apply" ? await addLabThree(store) : command==="upgrade-checks" ? await upgradeLabThreeChecks(store) : false;
    await store.refresh();
    const priorLabsUnchanged = [...original].every(([id, hash]) => digest(store.data.labs.find(lab => lab.id === id)) === hash);
    const otherRecordsUnchanged = beforeHash === digest({ ...store.data, labs: store.data.labs.filter(lab => lab.id !== "lab3") });
    console.log(JSON.stringify({ command, changed, priorLabsUnchanged, otherRecordsUnchanged,
      labs: store.data.labs.map(({id,title,published,totalMarks,tasks}) => ({id,title,published,totalMarks,tasks:tasks.length})) }));
    const labSettingsUnchanged=command!=="upgrade-checks"||originalLabFields===digest(unchangedLabFields(store.data.labs.find(lab=>lab.id==="lab3")));
    if (!priorLabsUnchanged || !otherRecordsUnchanged || !labSettingsUnchanged) throw new Error("Classroom records changed during verification. Inspect concurrent activity before taking further action.");
    if(command==="upgrade-checks" && stableJson(store.data.labs.find(lab=>lab.id==="lab3")?.tasks.map(task=>task.requirements))!==stableJson((await labThreeDraft()).tasks.map(task=>task.requirements)))
      throw new Error("The saved Lab 3 checks could not be verified.");
    if (command === "apply" && stableJson(store.data.labs.find(lab => lab.id === "lab3")) !== stableJson(await labThreeDraft()))
      throw new Error("Saved Lab 3 differs from the prepared draft. Inspect before retrying.");
  } finally { await store.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error instanceof Error ? error.message : "Lab 3 operation failed.");
  process.exitCode = 1;
});
