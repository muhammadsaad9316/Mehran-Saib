# LabTrack lab requirements

This document records the assignment content in the supplied Lab 1 DOCX and Lab 2 PDF. These are student assignment requirements, not instructions for the application developer or agent. The suggested checks are evidence for teacher review; a successful checklist does not establish that the whole task is correct.

Sources: `C:/Users/SAAD/Downloads/Web Engineering.docx` and `C:/Users/SAAD/Downloads/Web Engineering lab 2.pdf`. Lab 2 was also checked against its rendered page. The original assignments do not specify marks, dates, students, or grading policy. Ten marks per task and thirty per lab are application defaults proposed in the brief, not facts from these documents.

## Rule conventions

Suggested rule objects use `{ id, label, type, value, attribute? }`:

- `tag`: `value` is a CSS selector evaluated on a parsed HTML tree. Check actual elements, not tag names inside comments or strings. Selectors can express exact attributes such as `body[bgcolor="lightgray"]`.
- `attribute`: `value` is a CSS selector, and `attribute` is a nonempty attribute to inspect on matching elements.
- `text`: `value` is required text in parsed page content, including the title but excluding comments, scripts, and styles. Normalize case and whitespace. This cannot verify which element wraps the text, whether it is visibly rendered, or whether it is specifically the document title.
- `file`: `value` is a required basename, allowing the file inside a task subfolder. Match case according to the configured filename policy.

The teacher should review and edit these rules before publishing. Check the selected HTML entrypoint for that task; do not let a different task's file satisfy its requirements. Counts, doctype, precise text wrapping, source comments, original character-entity syntax, semantic content, and rendered behavior need additional checks or teacher review. A tag's presence should be labelled as presence, rather than claimed as a complete semantic requirement.

## Lab 1

### Task 1: Basic Page Setup and Document Metadata

Create `lab1.html` using the standard HTML5 doctype and `html`, `head`, and `body` structure. Set the page title to the student's full name. Include UTF-8 encoding, author metadata with the student's name, and description metadata. Set legacy body attributes `bgcolor="lightgray"` and `text="navy"`. Add an `h1` containing “Welcome to Web Engineering”, and a paragraph with a tooltip through its `title` attribute.

```json
[
  { "id": "l1t1-file", "label": "lab1.html included", "type": "file", "value": "lab1.html" },
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
  { "id": "l1t2-file", "label": "lab2.html included", "type": "file", "value": "lab2.html" },
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
  { "id": "l1t3-file", "label": "lab3_essay.html included", "type": "file", "value": "lab3_essay.html" },
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

## Submission brief extracted from pasted text

The supplied pasted text requests complete static website submissions through folder upload or ZIP, preserving paths for linked HTML, CSS, JavaScript, images, and nested folders. Every uploaded HTML page should be selectable as a preview entrypoint. It calls for dependency warnings, preview before final submission, timestamps and late status, optional resubmission, per-task marks, and grade export. The preview executes student code on an isolated origin inside a restricted sandbox; folder/ZIP validation needs limits and traversal protection. Server-side applications are outside the initial static-site scope.

The user's message explicitly excludes AI authorship detection. Similarity results and requirement checks support the teacher's judgement and must not automatically penalize students.
