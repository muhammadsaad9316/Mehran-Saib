export function allowNavigation() {
  return window.dispatchEvent(new Event("labtrack:before-navigate", { cancelable: true }));
}
