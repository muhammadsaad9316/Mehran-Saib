import { startBrowserFixture } from "../server/browser-fixture";

export default async function globalSetup() {
  return startBrowserFixture();
}
