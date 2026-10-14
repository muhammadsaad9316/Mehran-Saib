import type { Lab, Requirement, Submission, Task, User } from "../shared/types.js";
import type { Database, StoredUser } from "./store.js";
import { hashPassword } from "./auth.js";
import { readFile } from "node:fs/promises";

const rule = (
  id: string,
  label: string,
  type: Requirement["type"],
  value: string,
  attribute?: string,
): Requirement => ({
  id,
  label,
  type,
  value,
  ...(attribute ? { attribute } : {}),
});
const tag = (id: string, label: string, value: string) =>
  rule(id, label, "tag", value);
const attribute = (id: string, label: string, value: string, attr: string) =>
  rule(id, label, "attribute", value, attr);

export function initialLabs(): Lab[] {
  const basics: Task[] = [
    {
      id: "lab1-task1",
      title: "Page setup & metadata",
      maxMarks: 10,
      description:
        'Create an HTML page (any filename) with the HTML5 document structure. Use your full name as the title; include UTF-8, author and description metadata. Set body bgcolor="lightgray" and text="navy". Add “Welcome to Web Engineering” in an h1 and a paragraph with a title tooltip.',
      requirements: [
        rule("l1t1-file", "HTML page uploaded (any filename)", "file", "*.html"),
        tag("l1t1-title", "Page title present", "head > title"),
        tag(
          "l1t1-charset",
          "UTF-8 metadata present",
          'head meta[charset="utf-8" i]',
        ),
        attribute(
          "l1t1-author",
          "Author metadata has content",
          'head meta[name="author" i]',
          "content",
        ),
        attribute(
          "l1t1-description",
          "Description metadata has content",
          'head meta[name="description" i]',
          "content",
        ),
        tag(
          "l1t1-bg",
          "Lightgray body background",
          'body[bgcolor="lightgray" i]',
        ),
        tag("l1t1-color", "Navy body text", 'body[text="navy" i]'),
        tag("l1t1-heading", "Main heading present", "body h1"),
        rule(
          "l1t1-welcome",
          "Required welcome text present",
          "text",
          "Welcome to Web Engineering",
        ),
        attribute("l1t1-tooltip", "Paragraph has tooltip", "body p", "title"),
      ],
    },
    {
      id: "lab1-task2",
      title: "Headings & preformatted text",
      maxMarks: 10,
      description:
        "Create an HTML page (any filename). Display h1 through h6. Separate your course name and semester with a br in a paragraph. Add a poem or multiline text inside pre to demonstrate preserved spaces and line breaks.",
      requirements: [
        rule("l1t2-file", "HTML page uploaded (any filename)", "file", "*.html"),
        ...[1, 2, 3, 4, 5, 6].map((level) =>
          tag(
            `l1t2-h${level}`,
            `Heading level ${level} present`,
            `body h${level}`,
          ),
        ),
        tag("l1t2-break", "Paragraph line break present", "body p br"),
        tag("l1t2-pre", "Preformatted block present", "body pre"),
      ],
    },
    {
      id: "lab1-task3",
      title: "Essay formatting",
      maxMarks: 10,
      description:
        "Create an HTML page (any filename) with your full name in the title, gray body background and blue text. Add an h2 essay heading. Format Web Engineering with strong, essential with em and HTML with mark. Place hr after the second sentence, del around third, ins around fourth, sub around 2 in H2O and sup around 2 in x2.",
      requirements: [
        rule(
          "l1t3-file",
          "HTML page uploaded (any filename)",
          "file",
          "*.html",
        ),
        tag("l1t3-title", "Page title present", "head > title"),
        tag("l1t3-bg", "Gray body background", 'body[bgcolor="gray" i]'),
        tag("l1t3-color", "Blue body text", 'body[text="blue" i]'),
        ...["h2", "strong", "em", "mark", "hr", "del", "ins", "sub", "sup"].map(
          (value) =>
            tag(
              `l1t3-${value}`,
              `${value} formatting present`,
              `body ${value}`,
            ),
        ),
      ],
    },
  ];
  const textTasks: Task[] = [
    {
      id: "lab2-task1",
      title: "Technical article",
      maxMarks: 10,
      description:
        "Create a webpage titled “Emerging Technologies in Computer Science”. Add different heading levels and two paragraphs about artificial intelligence, cloud computing and software engineering. Include br, hr, b, strong, i, em, mark, del, ins and a multiline technical message in pre. The assignment does not prescribe a filename.",
      requirements: [
        tag("l2t1-title", "Page title present", "head > title"),
        rule("l2t1-title-text", "Required article title text present", "text", "Emerging Technologies in Computer Science"),
        tag("l2t1-heading", "Main heading present", "body h1"),
        tag(
          "l2t1-subheading",
          "Subheading present",
          "body h2, body h3, body h4, body h5, body h6",
        ),
        ...[
          "p",
          "br",
          "hr",
          "b",
          "strong",
          "i",
          "em",
          "mark",
          "del",
          "ins",
          "pre",
        ].map((value) =>
          tag(`l2t1-${value}`, `${value} element present`, `body ${value}`),
        ),
      ],
    },
    {
      id: "lab2-task2",
      title: "Company contact page",
      maxMarks: 10,
      description:
        'Create a fictional software company page. Include a company name, mission statement inside q, HTML and CSS abbreviations with full-form tooltips, address contact details, bdo dir="rtl", samp program output and var within a mathematical expression. Add HTML comments identifying major source sections.',
      requirements: [
        tag("l2t2-q", "Mission quotation present", "body q"),
        attribute(
          "l2t2-abbr",
          "Abbreviation has full-form tooltip",
          "body abbr",
          "title",
        ),
        tag("l2t2-address", "Contact address present", "body address"),
        tag(
          "l2t2-bdo",
          "Right-to-left override present",
          'body bdo[dir="rtl" i]',
        ),
        tag("l2t2-samp", "Sample output present", "body samp"),
        tag("l2t2-var", "Variable formatting present", "body var"),
      ],
    },
    {
      id: "lab2-task3",
      title: "Colors & character entities",
      maxMarks: 10,
      description:
        "Create “HTML Formatting and Character Entities” with a main heading and at least three sections divided by horizontal lines. Demonstrate named, RGB and hex colors. Use font with varied sizes, colors and faces. Display less-than, greater-than, ampersand, quotation marks, copyright, registered trademark, multiplication and division using character entities.",
      requirements: [
        tag("l2t3-title", "Page title present", "head > title"),
        rule("l2t3-title-text", "Required formatting title text present", "text", "HTML Formatting and Character Entities"),
        tag("l2t3-heading", "Main heading present", "body h1"),
        tag("l2t3-hr", "Horizontal divider present", "body hr"),
        ...["color", "size", "face"].map((attr) =>
          attribute(
            `l2t3-font-${attr}`,
            `Font specifies ${attr}`,
            "body font",
            attr,
          ),
        ),
        ...[
          ["copyright", "©"],
          ["registered", "®"],
          ["times", "×"],
          ["divide", "÷"],
        ].map(([name, value]) =>
          rule(`l2t3-${name}`, `${name} character displayed`, "text", value),
        ),
      ],
    },
  ];
  return [
    {
      id: "lab1",
      title: "HTML fundamentals",
      description:
        "Lab 01 · Document structure, headings and text formatting. Based on the supplied Web Engineering assignment. Demo deadlines and marks are illustrative.",
      dueDate: "2026-10-09T18:59:00.000Z",
      totalMarks: 30,
      published: true,
      tasks: basics,
    },
    {
      id: "lab2",
      title: "Text, links & colors",
      description:
        "Lab 02 · Technical articles, company documentation, colors and character entities. Based on the supplied PDF. Demo deadlines and marks are illustrative.",
      dueDate: "2026-10-16T18:59:00.000Z",
      totalMarks: 30,
      published: true,
      tasks: textTasks,
    },
    {
      id: "lab3",
      title: "Forms & tables",
      description:
        "Lab 03 · Example draft for planning. This lab is illustrative and was not included in the supplied assignment documents.",
      dueDate: "2026-10-23T18:59:00.000Z",
      totalMarks: 30,
      published: false,
      tasks: [
        {
          id: "lab3-task1",
          title: "Registration form",
          description: "Example draft: create a labelled registration form.",
          maxMarks: 10,
          requirements: [
            tag("l3t1-form", "Form present", "body form"),
            tag("l3t1-label", "Input label present", "body label"),
          ],
        },
        {
          id: "lab3-task2",
          title: "Course timetable",
          description: "Example draft: build an accessible course timetable.",
          maxMarks: 10,
          requirements: [
            tag("l3t2-table", "Table present", "body table"),
            tag("l3t2-th", "Table heading present", "body th"),
          ],
        },
        {
          id: "lab3-task3",
          title: "Form validation",
          description: "Example draft: use built-in field validation.",
          maxMarks: 10,
          requirements: [
            tag(
              "l3t3-required",
              "Required input present",
              "body input[required]",
            ),
          ],
        },
      ],
    },
  ];
}

function studentHtml(
  name: string,
  labIndex: number,
  taskIndex: number,
  index: number,
): string {
  const opening = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="author" content="${name}">\n<meta name="description" content="Web Engineering lab by ${name}">\n<title>${labIndex === 1 ? name : taskIndex === 1 ? "Emerging Technologies in Computer Science" : taskIndex === 3 ? "HTML Formatting and Character Entities" : `${name}'s Software Studio`}</title>\n<link rel="stylesheet" href="style.css">\n</head>\n`;
  let body: string;
  if (labIndex === 1 && taskIndex === 1)
    body = `<body bgcolor="lightgray" text="navy"><h1>Welcome to Web Engineering</h1><p title="My first HTML assignment">I am ${name}. This is my first Web Engineering laboratory.</p></body>`;
  else if (labIndex === 1 && taskIndex === 2)
    body = `<body>${[1, 2, 3, 4, 5, 6].map((level) => `<h${level}>Heading level ${level}</h${level}>`).join("\n")}<p>Web Engineering<br>Fourth semester</p><pre>A line of code,\n  a world to show.\nLearning every day.</pre></body>`;
  else if (labIndex === 1)
    body =
      '<body bgcolor="gray" text="blue"><h2>My Web Engineering Essay</h2><p><strong>Web Engineering</strong> teaches us modern web applications. <mark>HTML</mark> is an <em>essential</em> foundation of web development.</p><hr><p>We are in the <del>third</del> <ins>fourth</ins> semester. Water is H<sub>2</sub>O and mathematics uses x<sup>2</sup>.</p></body>';
  else if (taskIndex === 1)
    body = `<body><main><span class="eyebrow">A STUDENT PERSPECTIVE · ${name.toUpperCase()}</span><h1>Emerging Technologies in Computer Science</h1><p class="intro">Three ideas reshaping how we build software.</p><h2>Artificial intelligence</h2><p><strong>Artificial intelligence</strong> helps computers find patterns in data.<br>Building useful systems needs <em>careful evaluation</em> and <b>clear goals</b>.</p><hr><h2>Cloud computing & software engineering</h2><p>Cloud services let teams deploy applications around the world. <i>Software engineering</i> brings structure to that process, with <mark>testing</mark> and review.</p><p>Our project moved from <del>a single machine</del> to <ins>a reliable cloud deployment</ins>.</p><pre>build → test → deploy\n  observe → improve</pre><footer>Web Engineering / Lab 02 / ${name}</footer></main></body>`;
  else if (taskIndex === 2)
    body = `<body><main><!-- Company introduction --><h1>${name.split(" ")[0]} Software Studio</h1><q>Build thoughtful software that makes everyday work easier.</q><p>We work with <abbr title="HyperText Markup Language">HTML</abbr> and <abbr title="Cascading Style Sheets">CSS</abbr>.</p><!-- Contact details --><address>University Road, Karachi<br>hello@example.test</address><h2>Documentation</h2><bdo dir="rtl">Right to left demonstration</bdo><p><samp>Build completed successfully.</samp></p><p>Area = <var>length</var> × <var>width</var></p></main></body>`;
  else
    body =
      '<body><main><h1>HTML Formatting and Character Entities</h1><h2>Named colors</h2><font color="navy" size="5" face="Georgia">A named navy color.</font><hr><h2>RGB and hexadecimal</h2><font color="rgb(38,89,78)" size="4" face="Arial">RGB green.</font><p style="color:#8b5e3c">A hex color example.</p><hr><h2>Character entities</h2><p>&lt; &gt; &amp; &quot; &apos; &copy; &reg; &times; &divide;</p></main></body>';
  // Demo omissions create a visible requirement review, never an automatic score.
  if (index === 26 && labIndex === 2 && taskIndex === 1)
    body = body.replace(/<pre>[\s\S]*?<\/pre>/, "");
  return `${opening}${body}\n</html>`;
}

// Keep the original demo email aliases so existing logins continue to work.
const legacyDemoNames = [
    "Ali Raza",
    "Ayesha Khan",
    "Hamza Ahmed",
    "Fatima Noor",
    "Bilal Hassan",
    "Zainab Ali",
    "Usman Tariq",
    "Maryam Iqbal",
    "Ahmed Saeed",
    "Hira Shah",
    "Hassan Malik",
    "Iqra Faisal",
    "Saad Aslam",
    "Mahnoor Sheikh",
    "Omar Farooq",
    "Sana Javed",
    "Daniyal Abbas",
    "Eman Qureshi",
    "Huzaifa Anwar",
    "Laiba Yousaf",
    "Abdullah Saleem",
    "Anaya Hussain",
    "Muneeb Akhtar",
    "Areeba Siddiqui",
    "Talha Nadeem",
    "Alina Rafiq",
    "Shahzaib Rana",
    "Noor Fatima",
    "Waleed Mirza",
    "Mehwish Arif",
    "Asad Mehmood",
    "Saira Khalid",
    "Rayan Ashraf",
    "Aiman Zahid",
    "Fahad Butt",
    "Amna Nasir",
    "Sufyan Haider",
    "Zoya Imran",
    "Hasnain Shafi",
    "Nimra Aziz",
    "Student 41",
];

// Transcribed by roll number from the supplied marks sheet. Empty cells stay empty.
export const classRosterNames = [
  "Muhammad Haroon",
  "Waqas Ali Khan",
  "Muhammad Awais",
  "Asim Ahmad",
  "Muhammad Sudais",
  "Mansoor Ahmad",
  "Muhammad Bilal",
  "Uzair Ahmad",
  "Daniyal Tahir",
  "Habiba Khan",
  "Zaka Ullah",
  "Abdul Basit",
  "Muhammad Saad",
  "Abdullah Shah",
  "Saud Khan",
  "",
  "Musa Rahim",
  "Muhammad Abdullah",
  "Yasir Ullah",
  "Muhammad Shoaib",
  "Muhammad Zohaib",
  "Afsha Qayyum",
  "Imad ud din",
  "Muhasib Khan",
  "Muhammad Abbas",
  "",
  "",
  "Hayyan Khan",
  "Sabiha Khalid",
  "",
  "Ashfaq Akhtar",
  "Arbaz khan",
  "Huzaifa Khan",
  "",
  "Haseeb Ullah",
  "Marwa bibi",
  "",
  "Uzair Muhammad",
  "",
  "Muhammad Junaid",
  "Saman Ali",
] as const;

export function migrateDemoRoster<T extends User>(users: T[]): T[] {
  let changed = false;
  const renamed = users.map((user) => {
    const index = Number(user.rollNumber) - 1;
    // Only replace known sample names; later edits and real accounts are preserved.
    if (
      user.role !== "student" ||
      user.id !== `student-${String(index + 1).padStart(2, "0")}` ||
      user.name !== legacyDemoNames[index]
    ) return user;
    changed = true;
    return { ...user, name: classRosterNames[index] };
  });
  return changed ? renamed : users;
}

export async function demoDatabase(): Promise<Database> {
  const passwordHash = await hashPassword("LabTrack2026!");
  const students: StoredUser[] = classRosterNames.map((name, index) => ({
    id: `student-${String(index + 1).padStart(2, "0")}`,
    name,
    email: `${legacyDemoNames[index].toLowerCase().replaceAll(" ", ".")}@students.labtrack.edu`,
    role: "student",
    rollNumber: String(index + 1),
    passwordHash,
  }));
  const labs = initialLabs();
  const instructionDocuments = [
    {
      name: "Web Engineering.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    { name: "Web Engineering lab 2.pdf", contentType: "application/pdf" },
  ];
  for (const [index, document] of instructionDocuments.entries()) {
    const content = await readFile(
      new URL(`./fixtures/${document.name}`, import.meta.url),
    );
    labs[index].instructionFile = {
      ...document,
      content: content.toString("base64"),
    };
  }
  const submissions: Submission[] = [];
  for (let labIndex = 1; labIndex <= 2; labIndex++) {
    const count = labIndex === 1 ? 38 : 32;
    students.slice(0, count).forEach((student, index) => {
      const taskCount = labIndex === 2 && index >= 29 ? 1 : 3;
      labs[labIndex - 1].tasks
        .slice(0, taskCount)
        .forEach((task, taskIndex) => {
          const graded = labIndex === 1 || index < 25;
          const filename =
            labIndex === 1
              ? ["lab1.html", "lab2.html", "lab3_essay.html"][taskIndex]
              : ["article.html", "contact.html", "entities.html"][taskIndex];
          const submittedAt = `2026-10-${labIndex === 1 ? "08" : "12"}T${String(6 + (index % 6)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00.000Z`;
          submissions.push({
            id: `submission-${labIndex}-${index + 1}-${taskIndex + 1}`,
            studentId: student.id,
            labId: `lab${labIndex}`,
            taskId: task.id,
            files: [
              {
                path: filename,
                content: studentHtml(
                  student.name || `Roll no. ${student.rollNumber}`,
                  labIndex,
                  taskIndex + 1,
                  index,
                ),
              },
              {
                path: "style.css",
                content: `/* ${student.name}'s laboratory styles */\nbody { margin: 0; background: #faf9f6; color: #24352f; font: 17px/1.65 Georgia, serif; }\nmain { max-width: ${680 + index * 2}px; margin: 48px auto; padding: 32px; }\nh1 { font-size: 38px; line-height: 1.15; }\nh2 { margin-top: 30px; }\n.eyebrow, footer { font: 11px/1.5 Arial, sans-serif; letter-spacing: 2px; color: #6e7e76; }\npre { padding: 24px; background: #edf2ec; }\nhr { border: 0; border-top: 1px solid #dce3dc; margin: 30px 0; }`,
              },
            ],
            link: null,
            submittedAt,
            status: graded ? "graded" : "submitted",
            revision: 1,
            late: false,
            ...(graded
              ? {
                  grade: {
                    marks: 7 + ((index + taskIndex) % 4),
                    feedback: [
                      "Clear structure and thoughtful formatting. Well done.",
                      "Good work. Review your spacing and heading hierarchy.",
                      "All core requirements demonstrated. Keep source formatting consistent.",
                    ][(index + taskIndex) % 3],
                    published: true,
                    gradedAt: submittedAt,
                  },
                }
              : {}),
          });
        });
    });
  }
  return {
    users: [
      {
        id: "teacher-1",
        name: "Mehran Sahib",
        email: "teacher@labtrack.edu",
        role: "teacher",
        passwordHash,
      },
      ...students,
    ],
    labs,
    submissions,
    sessions: [],
    activity: [
      {
        id: "activity-1",
        text: "Roll no. 1 submitted Technical article",
        time: "2026-10-12T10:22:00.000Z",
        type: "submission",
      },
      {
        id: "activity-2",
        text: "Feedback published for roll no. 2",
        time: "2026-10-12T09:48:00.000Z",
        type: "grade",
      },
      {
        id: "activity-3",
        text: "Lab 02 is open for submissions",
        time: "2026-10-10T04:00:00.000Z",
        type: "lab",
      },
    ],
  };
}
