import type { Submission } from "../shared/types";

export const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function resolvePath(from: string, to: string): string | null {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(to)) return null;
  const parts = to.startsWith("/") ? [] : from.split("/").slice(0, -1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(to.split(/[?#]/)[0]);
  } catch {
    return null;
  }
  for (const part of decoded.replaceAll("\\", "/").split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}
export function buildPreview(
  submission: Submission,
  entry: string,
  assets: Record<string, string> = {},
): string {
  const content =
    submission.files.find((f) => f.path === entry)?.content ||
    "<p>No HTML entrypoint in this submission.</p>";
  const doc = new DOMParser().parseFromString(content, "text/html");
  doc
    .querySelectorAll("meta[http-equiv],base,iframe,object,embed")
    .forEach((e) => e.remove());
  const cssContent = (text: string, from: string) =>
    text.replace(
      /url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi,
      (_, url: string) =>
        `url("${Object.values(assets).includes(url) ? url : assets[resolvePath(from, url) || ""] || ""}")`,
    );
  doc.querySelectorAll("link").forEach((link) => {
    const file = submission.files.find(
      (f) => f.path === resolvePath(entry, link.getAttribute("href") || ""),
    );
    if (link.rel === "stylesheet" && file) {
      const style = doc.createElement("style");
      style.textContent = cssContent(file.content, file.path);
      link.replaceWith(style);
    } else link.remove();
  });
  doc.querySelectorAll("script[src]").forEach((script) => {
    const file = submission.files.find(
      (f) => f.path === resolvePath(entry, script.getAttribute("src") || ""),
    );
    if (file) {
      script.removeAttribute("src");
      script.textContent = file.content;
    } else script.remove();
  });
  doc.querySelectorAll("style").forEach((style) => {
    style.textContent = cssContent(style.textContent || "", entry);
  });
  doc
    .querySelectorAll("[style]")
    .forEach((el) =>
      el.setAttribute(
        "style",
        cssContent(el.getAttribute("style") || "", entry),
      ),
    );
  doc.querySelectorAll("img,source").forEach((el) => {
    const path = resolvePath(entry, el.getAttribute("src") || "");
    el.setAttribute("src", assets[path || ""] || "");
    el.removeAttribute("srcset");
  });
  const csp = doc.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = PREVIEW_CSP;
  doc.head.prepend(csp);
  const navigation = doc.createElement("script");
  navigation.textContent = `document.addEventListener('click',function(e){const a=e.target.closest('a');if(a){e.preventDefault();const href=a.getAttribute('href')||'';if(href.startsWith('#')){try{document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView()}catch{}return}parent.postMessage({type:'labtrack:navigate',href:href},'*')}});`;
  doc.body.append(navigation);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
