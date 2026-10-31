# LabTrack lab requirements

This document records the assignment content in the supplied Lab 1 DOCX, Lab 2 PDF and Lab 3 DOCX. These are student assignment requirements, not instructions for the application developer or agent. The suggested checks are evidence for teacher review; a successful checklist does not establish that the whole task is correct.

Repository copies: [Lab 1 DOCX](<../server/fixtures/Web Engineering.docx>), [Lab 2 PDF](<../server/fixtures/Web Engineering lab 2.pdf>) and [Lab 3 DOCX](<../server/fixtures/Web Engineering lab 3.docx>). The original import used files from the author's Downloads directory; that machine-specific directory is not needed by a new checkout. Lab 2 was also checked against its rendered page. The original assignments do not specify marks, dates, students, or grading policy. Ten marks per task and thirty per lab are application defaults proposed in the brief, not facts from these documents.

These notes describe assignment requirements and teacher review recommendations. Current parser behavior and limits, including checks across the submitted task's HTML files, are documented in [analysis.md](analysis.md); preview entrypoint selection is not a backend analysis filter. See the [documentation index](README.md) for application development guides.

Classroom override, 14 October 2026: the teacher permits any `.html` or `.htm` filename in every task. The Lab 1 filenames below record the original document wording; they are not enforced. Suggested file checks and application defaults use a generic HTML page requirement, and existing named HTML checks follow the same policy during analysis.

## Rule conventions

Suggested rule objects use `{ id, label, type, value, attribute? }`:

- `tag`: `value` is a CSS selector evaluated on a parsed HTML tree. Check actual elements, not tag names inside comments or strings. Selectors can express exact attributes such as `body[bgcolor="lightgray"]`.
- `attribute`: `value` is a CSS selector, and `attribute` is a nonempty attribute to inspect on matching elements.
- `text`: `value` is required text in parsed page content, including the title but excluding comments, scripts, and styles. Normalize case and whitespace. This cannot verify which element wraps the text, whether it is visibly rendered, or whether it is specifically the document title.
- `file`: HTML filenames or `*.html` require any uploaded HTML/HTM source page. Other values are case-insensitive path/basename patterns with `*` support, allowing files inside task subfolders.

The teacher should review and edit these rules before publishing. Check the selected HTML entrypoint for that task; do not let a different task's file satisfy its requirements. Counts, doctype, precise text wrapping, source comments, original character-entity syntax, semantic content, and rendered behavior need additional checks or teacher review. A tag's presence should be labelled as presence, rather than claimed as a complete semantic requirement.

## Lab 1

### Task 1: Basic Page Setup and Document Metadata

Create `lab1.html` using the standard HTML5 doctype and `html`, `head`, and `body` structure. Set the page title to the student's full name. Include UTF-8 encoding, author metadata with the student's name, and description metadata. Set legacy body attributes `bgcolor="lightgray"` and `text="navy"`. Add an `h1` containing “Welcome to Web Engineering”, and a paragraph with a tooltip through its `title` attribute.

```json
[
  { "id": "l1t1-file", "label": "HTML page uploaded (any filename)", "type": "file", "value": "*.html" },
  { "id": "l1t1-title", "label": "Page title element present", "type": "tag", "value": "head > title" },
  { "id": "l1t1-charset", "label": "UTF-8 metadata present", "type": "tag", "value": "head meta[charset=\"utf-8\" i]" },
  { "id": "l1t1-author", "label": "Author metadata has content", "type": "attribute", "value": "head meta[name=\"author\" i]", "attribute": "content" },
  { "id": "l1t1-description", "label": "Description metadata has content", "type": "attribute", "value": "head meta[name=\"description\" i]", "attribute": "content" },
  { "id": "l1t1-bg", "label": "Body background is lightgray", "type": "tag", "value": "body[bgcolor=\"lightgray\" i]" },
  { "id": "l1t1-color", "label": "Body text is navy", "type": "tag", "value": "body[text=\"navy\" i]" },
  { "id": "l1t1-heading", "label": "Main heading present", "type": "tag", "value": "body h1" },
  { "id": "l1t1-welcome", "label": "Required welcome text present", "type": "text", "value": "Welcome to Web Engineering" },
  { "id": "l1t1-tooltip", "label": "Paragraph has a tooltip", "type": "attribute", "value": "body p", "attribute": "title" }
]
```

Teacher review: explicit HTML5 source structure, full name in title and author content, required text inside the `h1`, and visible tooltip behavior. Do not reject legacy body attributes simply because modern HTML prefers CSS: this assignment explicitly requires them.

### Task 2: Headings, Line Breaks and Preformatted Text

Create `lab2.html`. Display all six heading levels from `h1` to `h6`. Include the course name and semester in a paragraph, separated by a `br`. Include a `pre` containing a short poem or multiline text demonstrating preserved spaces and line breaks.

```json
[
  { "id": "l1t2-file", "label": "HTML page uploaded (any filename)", "type": "file", "value": "*.html" },
  { "id": "l1t2-h1", "label": "Heading level 1 present", "type": "tag", "value": "body h1" },
  { "id": "l1t2-h2", "label": "Heading level 2 present", "type": "tag", "value": "body h2" },
  { "id": "l1t2-h3", "label": "Heading level 3 present", "type": "tag", "value": "body h3" },
  { "id": "l1t2-h4", "label": "Heading level 4 present", "type": "tag", "value": "body h4" },
  { "id": "l1t2-h5", "label": "Heading level 5 present", "type": "tag", "value": "body h5" },
  { "id": "l1t2-h6", "label": "Heading level 6 present", "type": "tag", "value": "body h6" },
  { "id": "l1t2-break", "label": "Paragraph contains a line break", "type": "tag", "value": "body p br" },
  { "id": "l1t2-pre", "label": "Preformatted block present", "type": "tag", "value": "body pre" }
]
```

Teacher review: course and semester are on opposite sides of the paragraph's line break; the preformatted content genuinely contains multiple lines or preserved spacing.

### Task 3: Formatting and Thematic Breaks

Create `lab3_essay.html`. Set the title to the student's full name and the body to `bgcolor="gray"`, `text="blue"`. Add an `h2` essay heading. Use the supplied paragraph, preserving its meaning, with the following explicit formatting:

- “Web Engineering” inside `strong` and “essential” inside `em`.
- “HTML” inside `mark`.
- `hr` immediately after the second sentence, separating the paragraph into two sections.
- “third” inside `del` and “fourth” inside `ins`.
- The 2 in H2O inside `sub`, and the 2 in x2 inside `sup`.

The practice paragraph states that Web Engineering teaches modern web applications, HTML is the foundation of web development, the semester changes from third to fourth, and water and mathematics use H2O and x2. The objective also names `b` and `i`, but the concrete paragraph rules prescribe `strong` and `em`; the teacher can decide whether additional demonstrations are expected.

```json
[
  { "id": "l1t3-file", "label": "HTML page uploaded (any filename)", "type": "file", "value": "*.html" },
  { "id": "l1t3-title", "label": "Page title element present", "type": "tag", "value": "head > title" },
  { "id": "l1t3-bg", "label": "Body background is gray", "type": "tag", "value": "body[bgcolor=\"gray\" i]" },
  { "id": "l1t3-color", "label": "Body text is blue", "type": "tag", "value": "body[text=\"blue\" i]" },
  { "id": "l1t3-heading", "label": "Essay heading present", "type": "tag", "value": "body h2" },
  { "id": "l1t3-strong", "label": "Strong formatting present", "type": "tag", "value": "body strong" },
  { "id": "l1t3-em", "label": "Emphasized formatting present", "type": "tag", "value": "body em" },
  { "id": "l1t3-mark", "label": "Highlighted formatting present", "type": "tag", "value": "body mark" },
  { "id": "l1t3-hr", "label": "Thematic divider present", "type": "tag", "value": "body hr" },
  { "id": "l1t3-del", "label": "Deleted text present", "type": "tag", "value": "body del" },
  { "id": "l1t3-ins", "label": "Inserted text present", "type": "tag", "value": "body ins" },
  { "id": "l1t3-sub", "label": "Subscript present", "type": "tag", "value": "body sub" },
  { "id": "l1t3-sup", "label": "Superscript present", "type": "tag", "value": "body sup" },
  { "id": "l1t3-sentence-1", "label": "First practice sentence present", "type": "text", "value": "Web Engineering is an essential course for computer science students because it teaches how modern web applications are built." },
  { "id": "l1t3-sentence-2", "label": "Second practice sentence present", "type": "text", "value": "Understanding HTML is the foundation of all web development." },
  { "id": "l1t3-sentence-3", "label": "Semester correction sentence present", "type": "text", "value": "Currently, I am in third fourth semester of my degree program." },
  { "id": "l1t3-sentence-4", "label": "Scientific notation sentence present", "type": "text", "value": "During our lectures, we learned that water is written as H2O and math formulas use terms like x2." }
]
```

Teacher review: title matches the student, the prescribed words are wrapped by the correct tags, the divider follows the second sentence, and the 2s appear in the proper expressions.

## Lab 2

The PDF does not prescribe filenames for these three tasks. Let the student select each task's HTML entrypoint rather than assuming `index.html` or copying Lab 1's filename requirements.

### Task 1: Technical Article Webpage

Create a webpage titled “Emerging Technologies in Computer Science”. Add a main heading and suitable subheadings using different heading levels. Write two paragraphs about artificial intelligence, cloud computing, and software engineering. Use `br` for separate lines and `hr` between sections. Demonstrate `b`, `strong`, `i`, `em`, `mark`, `del`, and `ins`. Use `pre` for a short technical message with preserved spacing and line breaks.

```json
[
  { "id": "l2t1-title", "label": "Page title element present", "type": "tag", "value": "head > title" },
  { "id": "l2t1-title-text", "label": "Required article title text present", "type": "text", "value": "Emerging Technologies in Computer Science" },
  { "id": "l2t1-heading", "label": "Main heading present", "type": "tag", "value": "body h1" },
  { "id": "l2t1-subheading", "label": "Subheading present", "type": "tag", "value": "body h2, body h3, body h4, body h5, body h6" },
  { "id": "l2t1-paragraph", "label": "Article paragraph present", "type": "tag", "value": "body p" },
  { "id": "l2t1-br", "label": "Line break present", "type": "tag", "value": "body br" },
  { "id": "l2t1-hr", "label": "Section divider present", "type": "tag", "value": "body hr" },
  { "id": "l2t1-b", "label": "Bold formatting present", "type": "tag", "value": "body b" },
  { "id": "l2t1-strong", "label": "Strong formatting present", "type": "tag", "value": "body strong" },
  { "id": "l2t1-i", "label": "Italic formatting present", "type": "tag", "value": "body i" },
  { "id": "l2t1-em", "label": "Emphasized formatting present", "type": "tag", "value": "body em" },
  { "id": "l2t1-mark", "label": "Highlighted formatting present", "type": "tag", "value": "body mark" },
  { "id": "l2t1-del", "label": "Deleted text present", "type": "tag", "value": "body del" },
  { "id": "l2t1-ins", "label": "Inserted text present", "type": "tag", "value": "body ins" },
  { "id": "l2t1-pre", "label": "Preformatted technical block present", "type": "tag", "value": "body pre" }
]
```

Teacher review: exact title, at least two meaningful paragraphs covering the requested subjects, distinct heading levels, and multiline technical text. The hint lists `h1` through `h6`; the instructions do not require all six levels in this task.

### Task 2: Software Company Contact and Documentation Page

Create a fictional software company page with its company name, a short mission statement in `q`, and abbreviations such as HTML and CSS in `abbr` with full forms. Add contact details in `address`. Use `bdo dir="rtl"` for right-to-left text, `samp` for sample program output, and `var` for variables in a mathematical expression. Include source comments identifying major sections.

```json
[
  { "id": "l2t2-q", "label": "Mission quotation present", "type": "tag", "value": "body q" },
  { "id": "l2t2-abbr", "label": "Abbreviation has a full-form tooltip", "type": "attribute", "value": "body abbr", "attribute": "title" },
  { "id": "l2t2-address", "label": "Contact address element present", "type": "tag", "value": "body address" },
  { "id": "l2t2-bdo", "label": "Right-to-left override present", "type": "tag", "value": "body bdo[dir=\"rtl\" i]" },
  { "id": "l2t2-samp", "label": "Sample output present", "type": "tag", "value": "body samp" },
  { "id": "l2t2-var", "label": "Variable formatting present", "type": "tag", "value": "body var" }
]
```

Teacher review: company name and coherent mission, accurate abbreviation expansions, meaningful contact details and sample output, variables within an expression, and actual HTML comment nodes identifying source sections. Comments must not satisfy any element checks.

### Task 3: HTML Colors, Fonts and Character Entities

Create a webpage titled “HTML Formatting and Character Entities”. Add a main heading and at least three sections, separated by horizontal lines. Demonstrate color names, RGB values, and hexadecimal values. Use the legacy `font` tag with different sizes, colors, and faces. Display less-than, greater-than, ampersand, quotation marks, copyright, registered trademark, multiplication, and division using appropriate character entities. The hints include `&lt;`, `&gt;`, `&amp;`, `&quot;`, `&apos;`, `&copy;`, `&reg;`, `&times;`, and `&divide;`.

```json
[
  { "id": "l2t3-title", "label": "Page title element present", "type": "tag", "value": "head > title" },
  { "id": "l2t3-title-text", "label": "Required formatting title text present", "type": "text", "value": "HTML Formatting and Character Entities" },
  { "id": "l2t3-heading", "label": "Main heading present", "type": "tag", "value": "body h1" },
  { "id": "l2t3-hr", "label": "Horizontal divider present", "type": "tag", "value": "body hr" },
  { "id": "l2t3-font-color", "label": "Font element specifies a color", "type": "attribute", "value": "body font", "attribute": "color" },
  { "id": "l2t3-font-size", "label": "Font element specifies a size", "type": "attribute", "value": "body font", "attribute": "size" },
  { "id": "l2t3-font-face", "label": "Font element specifies a face", "type": "attribute", "value": "body font", "attribute": "face" },
  { "id": "l2t3-copyright", "label": "Copyright character displayed", "type": "text", "value": "©" },
  { "id": "l2t3-registered", "label": "Registered trademark displayed", "type": "text", "value": "®" },
  { "id": "l2t3-times", "label": "Multiplication character displayed", "type": "text", "value": "×" },
  { "id": "l2t3-divide", "label": "Division character displayed", "type": "text", "value": "÷" }
]
```

Teacher review: exact title, at least three sections, all three color syntaxes, variations in font sizes/colors/faces, and every required entity in source and output. A parsed character does not prove an entity was used: inspect the original HTML token stream to distinguish `&copy;` or `&#169;` from a literal ©, while allowing semantically equivalent numeric entities. Do not reject `font` just because it is obsolete; the exercise explicitly asks for it.

## Lab 3

The initial structural checklist described below is superseded by the [Lab 3 semantic checker](lab3-checker.md). The assignment content is unchanged. New checks cover 37 source requirements with separate failure explanations and explicit review states.

Prepared from the supplied [Lab 3 DOCX](<../server/fixtures/Web Engineering lab 3.docx>) on 17 October 2026. The owner selected **draft**, **10 marks per task / 30 total**, and **no deadline**. The original document is attached unchanged; its SHA-256 is `ba775c54eb1787a134eefa9bb9180c926a3bab7dc9d364f86b3485f290824ed1`. Paragraphs and the practice-content table were inspected through DOCX extraction. Page rendering was unavailable because LibreOffice is not installed.

The assignment definition and complete checklists are in [lab-three.ts](../server/lab-three.ts). This is a separate, explicit addition through `Store.mutate`; startup, existing labs, demo seeds, accounts and grading rules are not changed. The demo seed's illustrative “Forms & tables” Lab 3 is unrelated; the addition refuses to overwrite it or any other existing Lab 3 with different content.

Live addition verified on **17 October 2026**: Lab 3 was saved as a draft with three tasks, 30 marks and no deadline. The persisted draft and attachment matched the prepared record exactly. Before/after digests confirmed both existing labs and all other classroom records (including the 25 existing submissions and their grades) were unchanged. Verification: 110 tests passed on Node 26.3.0, TypeScript/Vite build passed with `--configLoader runner` to avoid a local config-loader sandbox limitation, and isolated desktop/mobile browser checks verified all three editable task descriptions and marks.

### Task 1: CSS Styling, Links & Floating Images

Demonstrate all three CSS methods: an inline navy `h1`, an internal `style` block setting the body background to lightgray and styling `a:link`, `a:hover`, and `a:visited`, and a linked external `style.css`. Include an external link with `target="_blank"`, an internal `#section2` bookmark, and a clickable image floated left with text wrapping around it. The document suggests `lab1_styling.html`; the classroom's any-HTML/HTM-filename policy remains in force.

Advisory checks verify HTML and CSS files, structural styling evidence, link attributes, bookmark destination and linked-image nesting. The teacher must check the actual CSS declarations, stylesheet linkage, image loading, wrapping and browser behavior. The application's isolated preview intentionally restricts external navigation; inspect the link source as well.

### Task 2: Marquee Text & Image Animations

Use `marquee` for continuous left-scrolling text (`behavior="scroll"`, `direction="left"`), bouncing text (`alternate`), sliding text (`slide`), and an upward-scrolling box with `height: 200px; width: 300px; border: 2px solid black;`. Include an image inside a marquee. The suggested file is `lab2_marquee.html`; any HTML/HTM filename is accepted.

Advisory checks verify the requested marquee attributes and image nesting. The teacher reviews text, actual animation, dimensions and border. Preserve the assignment's explicit `marquee` requirement.

### Task 3: Tables & Course Lists

Create a centered, bordered table with Student ID, Name, Department and GPA headers, three data rows, and cells merged using `colspan` or `rowspan`. Format these supplied lists:

- Core Subjects: OOP, Web Engineering, Database Systems, using `ol type="I"`.
- Web Technologies: square-bulleted HTML5 and CSS3; nest an `ol type="a"` containing Headings and Tables under HTML5.
- Term Definitions: HTML — HyperText Markup Language; CSS — Cascading Style Sheets, using `dl`, `dt`, and `dd`.

The suggested file is `lab3_tables_lists.html`; any HTML/HTM filename is accepted. Advisory checks verify table/list structures, merge attributes and selected required text. They do not prove row counts, meaningful merging, table styling, exact content placement or list-marker appearance. Those remain teacher review.

## Lab 4

Prepared from the supplied [Lab 4 DOCX](<../server/fixtures/Web Engineering lab 4.docx>) on 31 October 2026. The owner selected **published for students**, **10 marks per task / 20 total**, and **no deadline**. The original attachment is retained unchanged; its SHA-256 is `21bc32cc4bba91d212012fa8bb8886832d44d69e95ff044b63182a8cb126a0d8`. The document has two task descriptions and two key-tag hint tables, with no embedded images. Its text and tables were extracted directly from OOXML; no replacement document was generated.

The definition is [lab-four.ts](../server/lab-four.ts). The explicit `publish` command appends the single lab through `Store.mutate`. It refuses an edited or duplicate Lab 4; repeating an unchanged addition performs no write, including after a compact Supabase read. Existing lab/task IDs, submissions, private source/image bytes, grades, accounts and sessions are retained. Startup and demo seeds are unchanged. No schema or frontend contract change is required. The command compares full before/after records without printing private contents and never restores an old snapshot over concurrent work.

Published on **31 October 2026** after a verified encrypted classroom backup. The saved published record and attachment matched the prepared assignment exactly. Full before/after digests confirmed all three prior labs and every other classroom record were unchanged, including 52 submissions, their source and raster bytes, seven saved grades, 42 accounts and sessions. All 141 tests and the TypeScript/Vite build passed. Isolated Edge checks passed at desktop 1440×900 and mobile/touch 390×844, verifying teacher editing, student instructions and task selection, keyboard access and an exact-byte handout download. No real student submission or grade was edited for verification.

### Task 1 University Home Page

Use `header` for a university name, `nav` for Home, Departments and Contact links, `section` for university information, `article` for vision and mission, `aside` for news, and `footer` for contact details and copyright text. Use `div` and `span` to organize and style content.

The existing structural checker verifies uploaded HTML, the specified elements, a navigation destination and the three navigation labels in parsed page text. The teacher reviews meaningful content, label placement, working navigation, vision/mission, news, footer information and visual organization. The checklist does not certify those semantic or rendered properties.

### Task 2 Student Registration Form

Create fields for student name, email, password, date of birth and phone number. Use radio buttons for gender, checkboxes for interests/skills, a department dropdown, an address `textarea` with both `required` and `maxlength="20"`, and `fieldset`/`legend` grouping. Provide Submit and Reset controls, and use `required`, `placeholder` and `maxlength` where appropriate.

Structural checks cover the form, text/email/password/date/tel/radio/checkbox inputs, a dropdown option, the required 20-character textarea, fieldset/legend, Submit/Reset controls and a field placeholder. They accept an omitted text-input type and a button's default submit type. Teacher review covers field meaning/labels, radio grouping, choices, appropriate constraints and actual behavior. No backend registration service is prescribed.

Save each task as a separate HTML file, open it in a browser to verify the output, and submit each task separately. The document's task1/task2 names are examples; the existing any-HTML/HTM-filename policy applies. Analysis remains advisory and never changes marks.

## Submission brief extracted from pasted text

The supplied pasted text requests complete static website submissions through folder upload or ZIP, preserving paths for linked HTML, CSS, JavaScript, images, and nested folders. Every uploaded HTML page should be selectable as a preview entrypoint. It calls for dependency warnings, preview before final submission, timestamps and late status, optional resubmission, per-task marks, and grade export. The preview executes student code on an isolated origin inside a restricted sandbox; folder/ZIP validation needs limits and traversal protection. Server-side applications are outside the initial static-site scope.

The user's message explicitly excludes AI authorship detection. Similarity results and requirement checks support the teacher's judgement and must not automatically penalize students.
