# Lab 3 requirement checks

The Lab 3 checker verifies static source evidence for the original assignment. It does not assign marks or decide authorship.

## Coverage

The definition in [shared/lab-three-checks.ts](../shared/lab-three-checks.ts) contains 33 named semantic checks plus four existing file checks: **14 for Task 1, 9 for Task 2 and 14 for Task 3**.

- **Task 1:** an HTML page, style.css upload, inline navy heading, internal lightgray body background, each of the three link states, actual linkage to nonempty valid style.css, an external new-tab link, a bookmark link and same-page destination, a linked uploaded image, left float and surrounding text without clearing that float.
- **Task 2:** an HTML page, nonempty visible text for each requested behavior/direction, a 200px height, 300px width, all four 2px solid black borders on the same upward marquee, and an uploaded image in a moving marquee.
- **Task 3:** an HTML page, a centered bordered table, four named headers in order, at least three nonempty four-column data rows, a meaningful valid merged-cell grid, uppercase Roman subject numbering, the three subjects in order, square technology bullets, HTML5/CSS3 outer items, lowercase alphabetic nested numbering under HTML5, Headings/Tables in order and both correctly paired definitions.

Every named check has an independent result. For example, a correct Task 2 with only `height:100px` receives **8/9**, and the failed height check says that 200px was expected and 100px was found.

## Evaluation

[server/lab-three-analysis.ts](../server/lab-three-analysis.ts) parses the already bounded source files using Cheerio and css-tree. It resolves uploaded relative paths, internal/linked local styles, selector specificity, inline declarations, importance and source order. Common shorthand declarations and equivalent RGB/hex/named colors are supported, as are simple px/rem/em lengths. Scheme-relative external links and legitimate wrapper elements around nested lists are accepted.

Checks use the one analyzed HTML page satisfying the most configured checks and identify it in the explanation. Evidence cannot be borrowed from another page. Table checks use one selected data table; upward box checks use one selected marquee.

No submitted JavaScript executes on the server. No remote page, stylesheet or image is fetched. Stylesheet expansion has finite depth, count and character bounds. These checks use the same source scan budget as the existing analyzer.

## Results and limits

- **Passed:** the configured static evidence was established.
- **Not met:** the evidence is absent, incorrect or internally inconsistent. The explanation identifies the expected condition.
- **Needs review:** scripts, conditional/unresolved CSS, remote dependencies or unsupported evaluation prevent a reliable result. This never counts as passed.

Static evidence does not certify actual pixels, successful remote navigation or animation over time. Final text wrapping depends on the viewport, fonts and intrinsic image dimensions; the wrap check establishes a left float, available surrounding text and no explicit full-width image. The teacher should confirm the rendered result in the existing isolated preview. Image checks establish an uploaded raster reference; they do not decode or certify every image byte. The existing upload/preview restrictions remain unchanged.

The semantic checks apply only when the saved checklist explicitly uses `type: "lab3"`. Existing Lab 1–2 rules and other manually configured checks retain their behavior. Named checks do not change saved grades or submission revisions.

## Deployment and existing classroom

Deploy the backend and frontend supporting the named check type before running `node --import tsx server/lab-three.ts upgrade-checks`. The command verifies the attached assignment and stable task IDs, rejects concurrent edits, changes only Lab 3's requirement arrays and lab revision, then checks that all other records and Lab 3 settings remain unchanged. It is safe to repeat after a successful upgrade. It does not reseed the classroom.

## Verification

[lab-three-analysis.test.ts](../server/lab-three-analysis.test.ts) covers one missing/incorrect case for every named check, complete sample projects, a single height failure, valid alternatives, cascade precedence, invisible/empty content, unresolved runtime styling and evidence split across pages or unrelated structures. [lab-three.test.ts](../server/lab-three.test.ts) covers API validation, data preservation, attachment integrity, append-only addition and the repeat-safe checklist upgrade.

Verification on 17 October 2026: all **118 tests** passed on Node 26.3.0; TypeScript and the Vite build passed using `--configLoader runner` for the local sandbox. A dedicated isolated browser check passed on desktop and mobile, including keyboard review, an 8/9 result with exactly one visible expected/actual explanation, the full analysis view and unchanged stored classroom records. All 16 existing Playwright scenarios also reported success; that runner stalled during fixture teardown and was manually stopped, so it did not produce a successful final exit status. These local checks do not by themselves establish a production deployment.
