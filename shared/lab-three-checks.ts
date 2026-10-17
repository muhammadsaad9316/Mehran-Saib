import type { Requirement } from "./types.js";

export const labThreeChecks = [
  ["l3t1-inline", "Inline heading color is navy", "heading-navy"],
  ["l3t1-internal", "Internal CSS sets a lightgray body background", "body-background"],
  ["l3t1-link-state", "Internal CSS styles unvisited links", "link-state"],
  ["l3t1-hover", "Internal CSS styles hovered links", "hover-state"],
  ["l3t1-visited", "Internal CSS styles visited links", "visited-state"],
  ["l3t1-external", "Uploaded style.css is linked and valid", "linked-stylesheet"],
  ["l3t1-link", "External link opens in a new tab", "external-link"],
  ["l3t1-bookmark", "Bookmark link points to section2", "bookmark-link"],
  ["l3t1-destination", "Bookmark destination exists in the same page", "bookmark-target"],
  ["l3t1-image", "Clickable image has a valid link and image source", "clickable-image"],
  ["l3t1-float", "Image floats left", "image-float"],
  ["l3t1-wrap", "Text can wrap beside the floated image", "image-wrapping"],
  ["l3t2-scroll", "Visible text scrolls continuously left", "marquee-scroll"],
  ["l3t2-alternate", "Visible text bounces", "marquee-alternate"],
  ["l3t2-slide", "Visible text slides in", "marquee-slide"],
  ["l3t2-up", "Visible text scrolls upwards", "marquee-up"],
  ["l3t2-height", "Upward marquee height is 200px", "marquee-height"],
  ["l3t2-width", "Upward marquee width is 300px", "marquee-width"],
  ["l3t2-border", "Upward marquee has a 2px solid black border", "marquee-border"],
  ["l3t2-image", "Marquee contains a visible uploaded image", "marquee-image"],
  ["l3t3-table", "Data table is centered", "table-centered"],
  ["l3t3-border", "Data table has a visible border", "table-border"],
  ["l3t3-header", "Header row contains Student ID, Name, Department and GPA", "table-headers"],
  ["l3t3-data", "Table has at least three complete data rows", "table-rows"],
  ["l3t3-merge", "Table uses a meaningful valid colspan or rowspan", "table-spans"],
  ["l3t3-roman", "Core Subjects uses uppercase Roman numbering", "subjects-numbering"],
  ["l3t3-subjects", "Core Subjects contains the three required subjects in order", "subjects-content"],
  ["l3t3-square", "Web Technologies uses square bullets", "technology-bullets"],
  ["l3t3-technologies", "Web Technologies lists HTML5 and CSS3", "technology-content"],
  ["l3t3-nested", "HTML5 contains a lowercase alphabetic nested list", "nested-numbering"],
  ["l3t3-nested-content", "HTML5 nested list contains Headings and Tables in order", "nested-content"],
  ["l3t3-html", "HTML description gives HyperText Markup Language", "definition-html"],
  ["l3t3-css", "CSS description gives Cascading Style Sheets", "definition-css"],
] as const;

export type LabThreeCheck = typeof labThreeChecks[number][2];
export const isLabThreeCheck = (value: unknown): value is LabThreeCheck =>
  labThreeChecks.some(check => check[2] === value);

export function labThreeRequirements(task: 1 | 2 | 3): Requirement[] {
  return [
    { id: "l3t" + task + "-file", label: "HTML page uploaded (any filename)", type: "file", value: "*.html" },
    ...(task === 1 ? [{ id: "l3t1-css", label: "style.css file uploaded", type: "file" as const, value: "style.css" }] : []),
    ...labThreeChecks.filter(([id]) => id.startsWith("l3t" + task + "-"))
      .map(([id, label, value]): Requirement => ({ id, label, type: "lab3", value })),
  ];
}
