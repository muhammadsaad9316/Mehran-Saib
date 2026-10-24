import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "artifacts/browser-results",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:3127", channel: process.env.PLAYWRIGHT_CHANNEL || undefined, screenshot: "only-on-failure" },
  projects: [
    { name:"desktop",use:{viewport:{width:1440,height:900}} },
    { name:"mobile",use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true} },
  ],
});
