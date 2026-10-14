/**
 * Stress-test seed: generates a heavy classroom dataset for bottleneck testing.
 *
 * Run:  npx tsx server/stress-seed.ts
 * Then: LABTRACK_DATA_DIR=.data/stress-test LABTRACK_DEMO=false npm run dev
 *
 * Creates 8 published labs with 3–5 tasks each, 41 students, and
 * hundreds of submissions mixing graded / ungraded / late / partial states.
 * Completely isolated from the live Supabase classroom.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "./auth.js";
import type { Lab, Requirement, Submission, Task, Activity } from "../shared/types.js";
import type { Database, StoredUser, Session } from "./store.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, ".data", "stress-test");

// ── helpers ──────────────────────────────────────────────────────────────────

let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${String(++idCounter).padStart(4, "0")}`;

const rule = (id: string, label: string, type: Requirement["type"], value: string, attribute?: string): Requirement => ({
  id, label, type, value, ...(attribute ? { attribute } : {}),
});
const tag = (id: string, label: string, value: string) => rule(id, label, "tag", value);
const attr = (id: string, label: string, value: string, a: string) => rule(id, label, "attribute", value, a);

// ── student roster (41 students) ─────────────────────────────────────────────

const studentNames = [
  "Muhammad Haroon", "Waqas Ali Khan", "Muhammad Awais", "Asim Ahmad",
  "Muhammad Sudais", "Mansoor Ahmad", "Muhammad Bilal", "Uzair Ahmad",
  "Daniyal Tahir", "Habiba Khan", "Zaka Ullah", "Abdul Basit",
  "Muhammad Saad", "Abdullah Shah", "Saud Khan", "Faraz Iqbal",
  "Musa Rahim", "Muhammad Abdullah", "Yasir Ullah", "Muhammad Shoaib",
  "Muhammad Zohaib", "Afsha Qayyum", "Imad ud din", "Muhasib Khan",
  "Muhammad Abbas", "Hamza Waheed", "Kashif Raza", "Hayyan Khan",
  "Sabiha Khalid", "Nadia Aslam", "Ashfaq Akhtar", "Arbaz Khan",
  "Huzaifa Khan", "Umer Farooq", "Haseeb Ullah", "Marwa Bibi",
  "Taimoor Shah", "Uzair Muhammad", "Rabia Noor", "Muhammad Junaid",
  "Saman Ali",
];

// ── HTML generators ──────────────────────────────────────────────────────────

function basicHtml(name: string, title: string, body: string, variant: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="author" content="${name}">
<meta name="description" content="Lab work by ${name}">
<title>${title}</title>
<link rel="stylesheet" href="style.css">
</head>
${body}
</html>`;
}

function styleSheet(name: string, index: number): string {
  const hue = (index * 37) % 360;
  return `/* ${name}'s laboratory styles */
body { margin: 0; background: hsl(${hue}, 12%, 97%); color: #24352f; font: 17px/1.65 Georgia, serif; }
main { max-width: ${680 + index * 2}px; margin: 48px auto; padding: 32px; }
h1 { font-size: 38px; line-height: 1.15; }
h2 { margin-top: 30px; }
pre { padding: 24px; background: hsl(${hue}, 8%, 93%); }
hr { border: 0; border-top: 1px solid #dce3dc; margin: 30px 0; }`;
}

// ── lab definitions ──────────────────────────────────────────────────────────

function makeLabs(): Lab[] {
  return [
    // Lab 1: HTML Fundamentals (3 tasks)
    {
      id: "stress-lab1", title: "HTML Fundamentals",
      description: "Document structure, headings and basic text formatting.",
      dueDate: "2026-09-20T18:59:00.000Z", totalMarks: 30, published: true,
      tasks: [
        { id: "sl1-t1", title: "Page setup & metadata", maxMarks: 10,
          description: "Create an HTML5 page with proper metadata, title, charset.",
          requirements: [
            rule("sl1t1-f", "HTML file included", "file", "index.html"),
            tag("sl1t1-title", "Page title present", "head > title"),
            tag("sl1t1-charset", "UTF-8 charset", 'head meta[charset="utf-8" i]'),
            attr("sl1t1-author", "Author metadata", 'head meta[name="author" i]', "content"),
            tag("sl1t1-h1", "Main heading present", "body h1"),
          ],
        },
        { id: "sl1-t2", title: "Headings & preformatted text", maxMarks: 10,
          description: "Display h1 through h6 and use pre for formatted text.",
          requirements: [
            ...[1,2,3,4,5,6].map(l => tag(`sl1t2-h${l}`, `Heading ${l}`, `body h${l}`)),
            tag("sl1t2-pre", "Pre block present", "body pre"),
          ],
        },
        { id: "sl1-t3", title: "Essay formatting", maxMarks: 10,
          description: "Use strong, em, mark, del, ins, sub, sup and hr.",
          requirements: [
            ...["strong","em","mark","hr","del","ins","sub","sup"].map(t =>
              tag(`sl1t3-${t}`, `${t} element`, `body ${t}`)),
          ],
        },
      ],
    },
    // Lab 2: Text & Colors (3 tasks)
    {
      id: "stress-lab2", title: "Text, Links & Colors",
      description: "Articles, company pages, and character entities.",
      dueDate: "2026-09-27T18:59:00.000Z", totalMarks: 30, published: true,
      tasks: [
        { id: "sl2-t1", title: "Technical article", maxMarks: 10,
          description: "Write about emerging technologies with proper formatting.",
          requirements: [
            tag("sl2t1-h1", "Main heading", "body h1"),
            tag("sl2t1-p", "Paragraph present", "body p"),
            tag("sl2t1-pre", "Code block", "body pre"),
            tag("sl2t1-strong", "Bold text", "body strong"),
            tag("sl2t1-em", "Italic text", "body em"),
          ],
        },
        { id: "sl2-t2", title: "Company contact page", maxMarks: 10,
          description: "Create a company page with q, abbr, address, bdo, samp, var.",
          requirements: [
            tag("sl2t2-q", "Quotation", "body q"),
            attr("sl2t2-abbr", "Abbreviation tooltip", "body abbr", "title"),
            tag("sl2t2-address", "Address present", "body address"),
            tag("sl2t2-samp", "Sample output", "body samp"),
          ],
        },
        { id: "sl2-t3", title: "Colors & entities", maxMarks: 10,
          description: "Demonstrate colors and HTML character entities.",
          requirements: [
            tag("sl2t3-font", "Font element", "body font"),
            rule("sl2t3-copy", "Copyright entity", "text", "©"),
            rule("sl2t3-times", "Times entity", "text", "×"),
          ],
        },
      ],
    },
    // Lab 3: Lists & Navigation (4 tasks)
    {
      id: "stress-lab3", title: "Lists & Navigation",
      description: "Ordered, unordered and definition lists with links.",
      dueDate: "2026-10-04T18:59:00.000Z", totalMarks: 40, published: true,
      tasks: [
        { id: "sl3-t1", title: "Ordered list", maxMarks: 10,
          description: "Create a numbered list of at least 5 items.",
          requirements: [tag("sl3t1-ol", "Ordered list", "body ol"), tag("sl3t1-li", "List item", "body ol li")],
        },
        { id: "sl3-t2", title: "Unordered list", maxMarks: 10,
          description: "Create a bulleted list with nested items.",
          requirements: [tag("sl3t2-ul", "Unordered list", "body ul"), tag("sl3t2-nested", "Nested list", "body ul ul")],
        },
        { id: "sl3-t3", title: "Definition list", maxMarks: 10,
          description: "Create a glossary of web terms using dl, dt, dd.",
          requirements: [tag("sl3t3-dl", "Definition list", "body dl"), tag("sl3t3-dt", "Term", "body dt"), tag("sl3t3-dd", "Definition", "body dd")],
        },
        { id: "sl3-t4", title: "Navigation bar", maxMarks: 10,
          description: "Create a nav element with anchor links.",
          requirements: [tag("sl3t4-nav", "Nav element", "body nav"), tag("sl3t4-a", "Anchor link", "body nav a")],
        },
      ],
    },
    // Lab 4: Tables (3 tasks)
    {
      id: "stress-lab4", title: "HTML Tables",
      description: "Course timetable, grade sheet, and merged cells.",
      dueDate: "2026-10-11T18:59:00.000Z", totalMarks: 30, published: true,
      tasks: [
        { id: "sl4-t1", title: "Basic timetable", maxMarks: 10,
          description: "Create a 5-day course timetable.",
          requirements: [tag("sl4t1-table", "Table", "body table"), tag("sl4t1-th", "Header cells", "body th"), tag("sl4t1-td", "Data cells", "body td")],
        },
        { id: "sl4-t2", title: "Grade sheet with colspan", maxMarks: 10,
          description: "Create a grade table using colspan and rowspan.",
          requirements: [tag("sl4t2-colspan", "Colspan", "body td[colspan], body th[colspan]"), tag("sl4t2-caption", "Caption", "body caption")],
        },
        { id: "sl4-t3", title: "Styled table", maxMarks: 10,
          description: "Style the table with borders and alternating rows.",
          requirements: [tag("sl4t3-thead", "Thead", "body thead"), tag("sl4t3-tbody", "Tbody", "body tbody")],
        },
      ],
    },
    // Lab 5: Forms (5 tasks) — the big one
    {
      id: "stress-lab5", title: "HTML Forms",
      description: "Registration, login, survey, feedback, and file upload forms.",
      dueDate: "2026-10-18T18:59:00.000Z", totalMarks: 50, published: true,
      tasks: [
        { id: "sl5-t1", title: "Registration form", maxMarks: 10,
          description: "Create a registration form with name, email, password.",
          requirements: [tag("sl5t1-form", "Form", "body form"), tag("sl5t1-input", "Input fields", "body input"), tag("sl5t1-label", "Labels", "body label")],
        },
        { id: "sl5-t2", title: "Login form", maxMarks: 10,
          description: "Create a simple login form with validation.",
          requirements: [tag("sl5t2-required", "Required attribute", "body input[required]"), tag("sl5t2-type", "Email type input", 'body input[type="email"]')],
        },
        { id: "sl5-t3", title: "Survey form", maxMarks: 10,
          description: "Create a survey with radio buttons, checkboxes and select.",
          requirements: [tag("sl5t3-radio", "Radio buttons", 'body input[type="radio"]'), tag("sl5t3-checkbox", "Checkboxes", 'body input[type="checkbox"]'), tag("sl5t3-select", "Select dropdown", "body select")],
        },
        { id: "sl5-t4", title: "Feedback form", maxMarks: 10,
          description: "Create a feedback form with textarea and fieldset.",
          requirements: [tag("sl5t4-textarea", "Textarea", "body textarea"), tag("sl5t4-fieldset", "Fieldset", "body fieldset"), tag("sl5t4-legend", "Legend", "body legend")],
        },
        { id: "sl5-t5", title: "File upload form", maxMarks: 10,
          description: "Create a form with file input and progress feedback.",
          requirements: [tag("sl5t5-file", "File input", 'body input[type="file"]'), tag("sl5t5-button", "Submit button", "body button")],
        },
      ],
    },
    // Lab 6: Multimedia (3 tasks)
    {
      id: "stress-lab6", title: "Images & Multimedia",
      description: "Images, audio, video and figure elements.",
      dueDate: "2026-10-25T18:59:00.000Z", totalMarks: 30, published: true,
      tasks: [
        { id: "sl6-t1", title: "Image gallery", maxMarks: 10,
          description: "Create a gallery with img, alt text, and figure/figcaption.",
          requirements: [tag("sl6t1-img", "Image element", "body img"), attr("sl6t1-alt", "Alt text", "body img", "alt"), tag("sl6t1-figure", "Figure", "body figure")],
        },
        { id: "sl6-t2", title: "Audio & video", maxMarks: 10,
          description: "Embed audio and video elements with controls.",
          requirements: [tag("sl6t2-audio", "Audio element", "body audio"), tag("sl6t2-video", "Video element", "body video")],
        },
        { id: "sl6-t3", title: "Responsive images", maxMarks: 10,
          description: "Use picture element and srcset for responsive images.",
          requirements: [tag("sl6t3-picture", "Picture element", "body picture"), tag("sl6t3-source", "Source element", "body source")],
        },
      ],
    },
    // Lab 7: Semantic HTML (4 tasks)
    {
      id: "stress-lab7", title: "Semantic HTML",
      description: "Article, section, aside, header, footer, main structure.",
      dueDate: "2026-11-01T18:59:00.000Z", totalMarks: 40, published: true,
      tasks: [
        { id: "sl7-t1", title: "Page layout", maxMarks: 10,
          description: "Create a page with header, main, footer and nav.",
          requirements: [tag("sl7t1-header", "Header", "body header"), tag("sl7t1-main", "Main", "body main"), tag("sl7t1-footer", "Footer", "body footer")],
        },
        { id: "sl7-t2", title: "Blog article", maxMarks: 10,
          description: "Create an article with sections, aside and time element.",
          requirements: [tag("sl7t2-article", "Article", "body article"), tag("sl7t2-section", "Section", "body section"), tag("sl7t2-time", "Time element", "body time")],
        },
        { id: "sl7-t3", title: "Accessibility", maxMarks: 10,
          description: "Use ARIA landmarks and roles for accessibility.",
          requirements: [attr("sl7t3-role", "Role attribute", "body [role]", "role"), attr("sl7t3-label", "Aria-label", "body [aria-label]", "aria-label")],
        },
        { id: "sl7-t4", title: "Details & dialog", maxMarks: 10,
          description: "Use details/summary elements for expandable content.",
          requirements: [tag("sl7t4-details", "Details element", "body details"), tag("sl7t4-summary", "Summary element", "body summary")],
        },
      ],
    },
    // Lab 8: CSS Basics (draft, published) — 3 tasks
    {
      id: "stress-lab8", title: "CSS Fundamentals",
      description: "Selectors, box model, colors and typography.",
      dueDate: "2026-11-08T18:59:00.000Z", totalMarks: 30, published: true,
      tasks: [
        { id: "sl8-t1", title: "Selectors & specificity", maxMarks: 10,
          description: "Demonstrate class, ID, element and attribute selectors.",
          requirements: [rule("sl8t1-css", "CSS file included", "file", "style.css")],
        },
        { id: "sl8-t2", title: "Box model", maxMarks: 10,
          description: "Show padding, margin, border and box-sizing.",
          requirements: [tag("sl8t2-div", "Div with styling", "body div")],
        },
        { id: "sl8-t3", title: "Typography & colors", maxMarks: 10,
          description: "Use web fonts, custom colors and gradients.",
          requirements: [tag("sl8t3-h1", "Styled heading", "body h1")],
        },
      ],
    },
  ];
}

// ── submission generator ─────────────────────────────────────────────────────

function generateSubmissions(
  labs: Lab[],
  students: StoredUser[],
): Submission[] {
  const submissions: Submission[] = [];
  const studentList = students.filter(s => s.role === "student");

  for (const [labIndex, lab] of labs.entries()) {
    // Vary submission coverage per lab: earlier labs have more submissions
    const coverageRate = Math.max(0.55, 1 - labIndex * 0.06);
    const submittingCount = Math.ceil(studentList.length * coverageRate);

    for (let si = 0; si < submittingCount; si++) {
      const student = studentList[si];
      // Some students submit only some tasks (partial submissions)
      const taskCoverage = si < submittingCount * 0.85 ? lab.tasks.length :
                           si < submittingCount * 0.92 ? Math.max(1, lab.tasks.length - 1) :
                           1;

      for (let ti = 0; ti < taskCoverage; ti++) {
        const task = lab.tasks[ti];
        const submissionId = `stress-sub-${labIndex + 1}-${si + 1}-${ti + 1}`;

        // Time: spread across 2 days before deadline
        const deadline = new Date(lab.dueDate);
        const hoursBeforeDeadline = 48 - (si * 1.2 + ti * 0.3);
        const submittedAt = new Date(deadline.getTime() - hoursBeforeDeadline * 3600_000);
        const late = si > submittingCount * 0.88; // ~12% late

        // Grading distribution:
        // Labs 1-3: mostly graded (teacher has been working through them)
        // Labs 4-5: partially graded (in progress)
        // Labs 6-8: mostly ungraded (recent submissions)
        let graded = false;
        if (labIndex < 3) {
          graded = si < submittingCount * 0.90; // 90% graded
        } else if (labIndex < 5) {
          graded = si < submittingCount * 0.35; // 35% graded
        } else {
          graded = si < submittingCount * 0.08; // 8% graded
        }

        // Generate realistic HTML content
        const htmlContent = generateHtmlForTask(student.name, lab, task, labIndex, ti, si);

        // Copy-paste detection: make ~8% of submissions deliberately similar to another
        const isCopyish = si > 0 && (si + ti * 7) % 13 === 0;
        const sourceContent = isCopyish
          ? generateHtmlForTask(studentList[si - 1].name, lab, task, labIndex, ti, si - 1)
            .replace(studentList[si - 1].name, student.name) // just change the name
          : htmlContent;

        const marks = graded
          ? Math.min(task.maxMarks, Math.max(0,
              Math.round((task.maxMarks * (0.5 + Math.random() * 0.5)) * 2) / 2))
          : undefined;

        const feedbackPool = [
          "Clear structure and good formatting. Well done.",
          "Good work. Consider improving your heading hierarchy.",
          "Solid implementation. Watch your indentation consistency.",
          "Nice effort. A few elements are missing from the requirements.",
          "Very clean code. Excellent attention to detail.",
          "Requirements are met but code could be better organized.",
          "Great work overall. Minor issues with spacing.",
          "Acceptable submission. Review the lab instructions again.",
        ];

        submissions.push({
          id: submissionId,
          studentId: student.id,
          labId: lab.id,
          taskId: task.id,
          files: [
            { path: `${task.id.split("-").pop()}.html`, content: sourceContent },
            { path: "style.css", content: styleSheet(student.name, si) },
          ],
          link: null,
          submittedAt: submittedAt.toISOString(),
          status: graded ? "graded" : "submitted",
          revision: isCopyish ? 2 : 1, // similar tasks have been resubmitted
          late,
          ...(graded ? {
            grade: {
              marks: marks!,
              feedback: feedbackPool[(si + ti + labIndex) % feedbackPool.length],
              published: labIndex < 3 ? true : Math.random() > 0.3, // some draft grades
              gradedAt: new Date(submittedAt.getTime() + 86400_000).toISOString(),
            },
          } : {}),
        });
      }
    }
  }

  return submissions;
}

function generateHtmlForTask(
  name: string,
  lab: Lab,
  task: Task,
  labIdx: number,
  taskIdx: number,
  studentIdx: number,
): string {
  // Generate varied but valid HTML that passes most requirements
  const bodies: Record<string, string> = {
    "sl1-t1": `<body bgcolor="lightgray" text="navy"><h1>Welcome to Web Engineering</h1><p title="My first lab assignment">I am ${name}. This is my Web Engineering laboratory.</p></body>`,
    "sl1-t2": `<body>${[1,2,3,4,5,6].map(l => `<h${l}>Heading level ${l}</h${l}>`).join("\n")}<p>Web Engineering<br>Semester 07</p><pre>Code line 1\n  indented line 2\nfinal line</pre></body>`,
    "sl1-t3": `<body><h2>Essay by ${name}</h2><p><strong>Web Engineering</strong> teaches us <em>essential</em> skills with <mark>HTML</mark>.</p><hr><p><del>old text</del> <ins>new text</ins>. H<sub>2</sub>O and x<sup>2</sup>.</p></body>`,
    "sl2-t1": `<body><main><h1>Emerging Technologies</h1><p><strong>Artificial intelligence</strong> transforms industries with <em>smart automation</em>.</p><hr><h2>Cloud Computing</h2><p>Scalable infrastructure for modern applications. <mark>Testing</mark> ensures quality.</p><pre>build → test → deploy</pre></main></body>`,
    "sl2-t2": `<body><main><h1>${name.split(" ")[0]} Software Studio</h1><q>Building software that matters.</q><p><abbr title="HyperText Markup Language">HTML</abbr> and <abbr title="Cascading Style Sheets">CSS</abbr>.</p><address>${name}<br>University Road</address><bdo dir="rtl">RTL demo</bdo><p><samp>Build successful.</samp> Area = <var>l</var> × <var>w</var></p></main></body>`,
    "sl2-t3": `<body><main><h1>HTML Formatting and Character Entities</h1><h2>Colors</h2><font color="navy" size="5" face="Georgia">Navy text.</font><hr><h2>Entities</h2><p>&lt; &gt; &amp; &quot; © ® × ÷</p></main></body>`,
    "sl3-t1": `<body><h1>Ordered List</h1><ol><li>First item</li><li>Second item</li><li>Third item</li><li>Fourth item</li><li>Fifth item</li></ol></body>`,
    "sl3-t2": `<body><h1>Unordered List</h1><ul><li>Item A</li><li>Item B<ul><li>Nested 1</li><li>Nested 2</li></ul></li><li>Item C</li></ul></body>`,
    "sl3-t3": `<body><h1>Glossary</h1><dl><dt>HTML</dt><dd>HyperText Markup Language</dd><dt>CSS</dt><dd>Cascading Style Sheets</dd><dt>JS</dt><dd>JavaScript</dd></dl></body>`,
    "sl3-t4": `<body><nav><a href="#home">Home</a> <a href="#about">About</a> <a href="#contact">Contact</a></nav><main><h1>Navigation Demo</h1><p>Page content here.</p></main></body>`,
    "sl4-t1": `<body><h1>Course Timetable</h1><table><tr><th>Day</th><th>9 AM</th><th>11 AM</th></tr><tr><td>Monday</td><td>Web Engineering</td><td>Database</td></tr><tr><td>Tuesday</td><td>OS</td><td>Networks</td></tr></table></body>`,
    "sl4-t2": `<body><table><caption>Grade Sheet</caption><tr><th colspan="3">Student Marks</th></tr><tr><td>Name</td><td>Lab</td><td>Final</td></tr><tr><td>${name}</td><td>28</td><td>85</td></tr></table></body>`,
    "sl4-t3": `<body><table><thead><tr><th>Subject</th><th>Grade</th></tr></thead><tbody><tr><td>HTML</td><td>A</td></tr><tr><td>CSS</td><td>B+</td></tr></tbody></table></body>`,
    "sl5-t1": `<body><h1>Registration</h1><form><label>Name <input type="text" name="name"></label><label>Email <input type="email" name="email"></label><label>Password <input type="password" name="pass"></label><button type="submit">Register</button></form></body>`,
    "sl5-t2": `<body><h1>Login</h1><form><label>Email <input type="email" required></label><label>Password <input type="password" required></label><button>Login</button></form></body>`,
    "sl5-t3": `<body><h1>Survey</h1><form><p>Gender: <input type="radio" name="g" value="m"> Male <input type="radio" name="g" value="f"> Female</p><p><input type="checkbox" name="agree"> I agree</p><select name="dept"><option>CS</option><option>SE</option></select></form></body>`,
    "sl5-t4": `<body><h1>Feedback</h1><form><fieldset><legend>Your Feedback</legend><textarea rows="5" cols="40">Enter feedback here</textarea></fieldset><button>Submit</button></form></body>`,
    "sl5-t5": `<body><h1>File Upload</h1><form enctype="multipart/form-data"><label>Choose file: <input type="file" name="doc"></label><button type="submit">Upload</button></form></body>`,
    "sl6-t1": `<body><h1>Gallery</h1><figure><img src="photo.jpg" alt="A landscape photo"><figcaption>Beautiful scenery</figcaption></figure></body>`,
    "sl6-t2": `<body><h1>Media</h1><audio controls><source src="song.mp3" type="audio/mpeg">Audio not supported.</audio><video controls width="320"><source src="clip.mp4" type="video/mp4">Video not supported.</video></body>`,
    "sl6-t3": `<body><h1>Responsive Images</h1><picture><source media="(min-width: 800px)" srcset="large.jpg"><source media="(min-width: 400px)" srcset="medium.jpg"><img src="small.jpg" alt="Responsive image"></picture></body>`,
    "sl7-t1": `<body><header><nav><a href="#">Home</a></nav></header><main><h1>Welcome</h1><p>Main content area.</p></main><footer><p>© 2026 ${name}</p></footer></body>`,
    "sl7-t2": `<body><article><h1>My Blog Post</h1><section><h2>Introduction</h2><p>Published on <time datetime="2026-10-01">October 1, 2026</time>.</p></section><aside><p>Related articles.</p></aside></article></body>`,
    "sl7-t3": `<body><div role="banner" aria-label="Site header"><h1>Accessible Page</h1></div><div role="main" aria-label="Main content"><p>Content with ARIA.</p></div></body>`,
    "sl7-t4": `<body><h1>FAQ</h1><details><summary>What is HTML?</summary><p>HyperText Markup Language for web pages.</p></details><details><summary>What is CSS?</summary><p>Cascading Style Sheets for styling.</p></details></body>`,
    "sl8-t1": `<body><div class="box" id="main-box"><h1>Selectors Demo</h1><p class="intro">Class selector example.</p><p data-info="test">Attribute selector.</p></div></body>`,
    "sl8-t2": `<body><div style="padding: 20px; margin: 10px; border: 2px solid #333; box-sizing: border-box;"><h1>Box Model</h1><p>This div demonstrates padding, margin, border.</p></div></body>`,
    "sl8-t3": `<body><h1 style="font-family: Georgia; color: #2d5a3d; background: linear-gradient(135deg, #f0f4f1, #dce8e0); padding: 20px;">Typography & Colors</h1></body>`,
  };

  const body = bodies[task.id] || `<body><h1>${task.title}</h1><p>Submitted by ${name}.</p></body>`;

  // Add minor variation per student
  const variedBody = body.replace("</body>",
    `\n<!-- Submitted by ${name}, student ${studentIdx + 1} -->\n` +
    `<!-- ${new Date().toISOString()} -->\n</body>`
  );

  return basicHtml(name, task.title, variedBody, studentIdx);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔨 Generating stress-test classroom data...\n");

  const passwordHash = await hashPassword("LabTrack2026!");

  // Teacher
  const teacher: StoredUser = {
    id: "stress-teacher",
    name: "Mehran Sahib",
    email: "teacher@stress.labtrack.edu",
    role: "teacher",
    passwordHash,
  };

  // 41 students
  const students: StoredUser[] = studentNames.map((name, i) => ({
    id: `stress-student-${String(i + 1).padStart(2, "0")}`,
    name,
    email: `${name.toLowerCase().replaceAll(" ", ".")}@stress.labtrack.edu`,
    role: "student" as const,
    rollNumber: String(i + 1),
    passwordHash,
  }));

  const labs = makeLabs();
  const submissions = generateSubmissions(labs, students);

  // Summary stats
  const ungraded = submissions.filter(s => !s.grade).length;
  const graded = submissions.filter(s => s.grade).length;
  const lateCount = submissions.filter(s => s.late).length;
  const totalTasks = labs.reduce((sum, l) => sum + l.tasks.length, 0);

  console.log(`  Labs:         ${labs.length}`);
  console.log(`  Total tasks:  ${totalTasks}`);
  console.log(`  Students:     ${students.length}`);
  console.log(`  Submissions:  ${submissions.length}`);
  console.log(`  ├─ Graded:    ${graded}`);
  console.log(`  ├─ Ungraded:  ${ungraded}`);
  console.log(`  └─ Late:      ${lateCount}`);

  const activity: Activity[] = [
    { id: "sa-1", text: "Stress-test classroom generated", time: new Date().toISOString(), type: "lab" },
    { id: "sa-2", text: `${submissions.length} submissions across ${labs.length} labs`, time: new Date().toISOString(), type: "submission" },
    { id: "sa-3", text: `${ungraded} tasks waiting for review`, time: new Date().toISOString(), type: "grade" },
  ];

  const database: Database = {
    users: [teacher, ...students],
    labs,
    submissions,
    activity,
    sessions: [] as Session[],
  };

  await mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, "labtrack.json");
  await writeFile(filePath, JSON.stringify(database), { mode: 0o600 });

  const sizeMB = (Buffer.byteLength(JSON.stringify(database)) / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Written ${sizeMB} MB to ${path.relative(rootDir, filePath)}`);
  console.log(`\nTo run the stress-test environment:\n`);
  console.log(`  $env:LABTRACK_DATA_DIR=".data/stress-test"; $env:LABTRACK_DEMO="false"; $env:SUPABASE_URL=""; $env:SUPABASE_SECRET_KEY=""; npx concurrently -k "node --watch --watch-path=./server --watch-path=./shared --import tsx server/index.ts" "vite --host 127.0.0.1"`);
  console.log(`\nLogin: teacher@stress.labtrack.edu / LabTrack2026!\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
