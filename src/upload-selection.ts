export function mergeProjectFiles(current: File[], selected: File[]) {
  const path = (file: File) => (file.webkitRelativePath || file.name).replaceAll("\\", "/").toLowerCase();
  const files = new Map(current.map(file => [path(file), file]));
  const replaced = new Set<string>();
  for (const file of selected) {
    const key = path(file);
    if (files.has(key)) replaced.add(key);
    files.set(key, file);
  }
  return { files: [...files.values()], replaced: replaced.size };
}

export function uploadSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}
