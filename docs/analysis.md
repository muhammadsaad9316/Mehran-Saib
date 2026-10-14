# Uploads, previews and analysis

These services support static HTML/CSS/JavaScript lab projects. They do not run submitted programs on the server, crawl remote project links or assign marks. Teacher judgment remains necessary after any successful checklist or similarity result.

## Upload pipeline

[server/app.ts](../server/app.ts) verifies student access before Multer buffers multipart input. It bounds request bytes, then [uploads.ts](../server/uploads.ts) validates/extracts project files. Source text stays in `files`; raster bytes stay in private `binaryAssets` as base64, with public metadata in `assets`.

| Item | Current allowance |
| --- | --- |
| Source extensions | HTML, HTM, CSS, JS, TXT, JSON, valid UTF-8 |
| Raster extensions | PNG, JPG/JPEG, GIF, WebP, ICO |
| Archive | ZIP containing only accepted types; nested ZIPs unsupported |
| Uploaded/extracted files | At most 60 |
| Individual source file | At most 1 MiB |
| Combined extracted project | At most 4 MiB |
| Request bytes | 4 MiB + 64 KiB multipart allowance |
| ZIP entries | At most 80 including directories |
| Path | At most 200 characters, relative, preserved with `/` separators |

The UI often labels binary-unit budgets as MB; code uses powers of 1024. ZIP declared uncompressed size is checked before decompression and extracted bytes are checked afterward. Hidden paths, dot/traversal components, absolute/drive paths, control characters, unsupported types, case-insensitive duplicates, encryption and damaged entries are rejected. Uploaded raster types are selected by extension; this is not a full image decoding or antivirus pipeline.

An image-only upload without a project link is rejected: at least one accepted source file or link is needed. Links must be HTTP(S) without embedded credentials. Link-only projects can be reviewed externally by the teacher but contain no fetched source for the analyzer.

## Preview scope

[src/preview.ts](../src/preview.ts) creates iframe `srcDoc`, removes conflicting metadata/base/nested embed elements, inlines accepted local CSS and JS, rewrites raster references and inserts CSP. The iframe permits scripts but has an opaque origin. Fetch, remote dependencies, nested contexts and form submissions are blocked.

Both individual review and pair comparison validate navigation messages against the sending iframe, then select only an uploaded HTML page. See [frontend](frontend.md) for the full boundary. The preview is not a general browser/server emulator: remote libraries, module graphs and backend apps require external review.

## Requirement checks

[server/analysis.ts](../server/analysis.ts) uses Cheerio for HTML, css-tree for CSS and Acorn for JavaScript. Rules are the teacher's stored `Requirement` objects:

| Type | Actual evaluation |
| --- | --- |
| `tag` | CSS selector matches a source element in parsed HTML; parser-inserted wrappers do not count |
| `attribute` | Selector matches a source element whose named attribute is nonempty |
| `text` | Case/whitespace-normalized text appears in parsed page content, including title and excluding comments/scripts/styles |
| `file` | Case-insensitive path or basename match, with `*` wildcard support; checks source and asset metadata |

Checks examine the HTML documents in the submitted task project within scan limits; selecting a preview entrypoint does **not** restrict backend analysis to that page. The original [assignment notes](lab-requirements.md) describe teacher review of the intended task entrypoint; do not mistake that recommendation for an implemented entrypoint parameter.

The checks cannot prove correct layout, visible rendering, semantic relevance, exact placement/counts, entity spelling or student identity in a title. An attribute rule checks presence/nonempty value; constrain the selector to check an exact attribute value. Invalid selectors produce a failed rule with an edit message. Quality observations include syntax/dependency issues and other static checks; absence of observations is not proof of correctness.

## Similarity algorithm

1. Parse uploaded HTML/CSS/JS into normalized features. JavaScript identifier names are normalized so simple renaming does not erase matching evidence.
2. Exclude standard document scaffolding, configured required tags/text, quoted instruction examples and a compatibility case for the supplied Lab 1 essay paragraph.
3. Build fingerprints from windows of nine features, retaining repeated occurrences. Small-file fingerprints affect project coverage without independently establishing a substantial match.
4. Compare only different students in the same lab/task. Compute overlap separately by source kind, counting the minimum shared occurrence count.
5. Compute `sourceCoverage` and `peerCoverage` by flooring overlap as a percentage of each project's fingerprints. `percentage` is the lower coverage.
6. A pair is `comparable` only with complete parsing and at least eight substantial overlapping fingerprint occurrences. Keep at most three sample blocks, each with filename and up to 800 characters of excerpt.

If a small project is fully shared with a much larger original project, only the small side can have high coverage; using the lower percentage prevents that alone from flagging both projects. Group matches return all eligible pairs, so three matching students are all represented.

`CheckTasks` flags only `comparable` pairs whose percentage is **strictly greater** than 70, or the selected 50. Exactly 70 does not pass the 70 threshold. Returned positive evidence can still be incomplete or below the threshold. Sample highlighted blocks are excerpts, not the entire scoring input.

There is no AI provider call, authorship classifier, plagiarism verdict, automatic deduction or grading write in this service.

## Analysis budgets

| Budget | Limit |
| --- | --- |
| Source files inspected per submission | 40 |
| Characters processed per submission | 200,000 |
| Batch submissions / single-review peer candidates | 200 |
| Aggregate batch/peer character allowance | 2,000,000 |

These are independent of the larger upload allowance. Accepted uploads can exceed analyzer coverage; scan notices/quality errors must remain visible and require manual review. Pair scans are quadratic in the bounded number of analyzed submissions and run synchronously in the API. Fingerprint summaries/totals are computed once per source kind within the request and reused across pairs, without a global source cache. Larger classes need a deliberate performance redesign before simply increasing limits.

## Instruction-document extraction

[server/instructions.ts](../server/instructions.ts) powers the teacher-only `POST /api/instructions/analyze`. It returns `{ tasks, notice, text }` without saving anything. The current lab editor does not call this endpoint; it edits tasks/rules manually and retains existing attachments.

Attachments use raw base64 and a maximum decoded size of 3 MiB. Supported extraction: text-based PDF (pdfjs-dist), DOCX (Mammoth), TXT/MD. Legacy DOC can be attached to a lab but automatic extraction rejects it. Scanned PDFs need manual entry; there is no OCR.

PDFs are limited to 25 pages. DOCX packages need `word/document.xml`, at most 500 archive entries and at most 20 MiB declared uncompressed content. Extracted text is capped at 250,000 characters. Task/Exercise headings split up to 20 sections; otherwise one draft task is returned. Drafts default to ten marks, cap descriptions to 8,000 characters and candidate rules to 80 per task. Explicit tags, shown attributes, filenames and selected quoted text yield candidates; examples are not necessarily mandatory requirements.

Teachers must review rules, marks and task IDs before saving/publishing. Candidate filenames can mention types such as SVG that project upload does not accept; reconcile those rules with upload support rather than promising every extracted filename can be uploaded.

## Verification

`uploads.test.ts` covers traversal, expansion, duplicates, encoding and limits. `analysis.test.ts` covers comments/inserted wrappers, exclusions, renaming, syntax, dependencies, whole-project coverage, repeats, group matches and incomplete/tiny evidence. `instructions.test.ts` covers drafts, original fixtures, malformed/oversized documents and page bounds. Frontend preview tests check path/CSP constants; browser execution still needs manual verification.
