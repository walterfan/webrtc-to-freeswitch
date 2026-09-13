import { expect, test, type Page } from "@playwright/test";

const config = {
  environment: "development",
  sipWebSocketUrl: "ws://127.0.0.1:7443",
  sipDomain: "localhost",
  iceServers: [],
  registration: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 },
  dtmf: { preferredMethod: "rtp" },
};

async function openApp(page: Page) {
  await page.addInitScript(() => {
    window.__USE_FAKE_SIGNALING__ = true;
  });
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(config),
      });
      return;
    }
    if (url.includes("127.0.0.1:5174") || url.includes("localhost:5174")) {
      await route.continue();
      return;
    }
    await route.abort();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Service ready");
  await expect(page.getByRole("heading", { name: "SIP messages" })).toBeVisible();
}

test("startup, register, outgoing, incoming, autoplay recovery, and disconnect", async ({
  page,
}) => {
  await openApp(page);
  await page.getByLabel("SIP WebSocket URL").fill("ws://127.0.0.1:7443");
  await page.getByLabel("SIP domain").fill("localhost");
  await page.getByLabel("SIP username").fill("1001");
  await page.getByLabel("SIP password").fill("pw");
  await page.getByTestId("connect").click();
  await expect(page.getByRole("status")).toContainText("Registration: registered");
  await page.evaluate(() => {
    const sip = window.__FAKE_SIP__ as {
      emitSipMessage: (message: { direction: "send" | "receive"; raw: string }) => void;
    };
    sip.emitSipMessage({
      direction: "send",
      raw: "REGISTER sip:localhost SIP/2.0\r\nCall-ID: e2e-id\r\n\r\n",
    });
  });
  await expect(page.getByText("REGISTER sip:localhost SIP/2.0")).toBeVisible();
  await page.getByTestId("sip-trace-row").click();
  await expect(page.getByText("Call-ID: e2e-id")).toBeVisible();

  await page.getByLabel("Destination").fill("1002");
  await page.getByRole("button", { name: "Call", exact: true }).click();
  await expect(page.getByText("Calling 1002")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.evaluate(() => {
    const sip = window.__FAKE_SIP__ as {
      emitIncoming: (identity?: { displayName: string; uri: string }) => void;
    };
    sip.emitIncoming({ displayName: "Bob", uri: "sip:1003@localhost" });
  });
  await expect(page.getByText("Incoming call from Bob")).toBeVisible();
  await page.getByTestId("answer").click();
  await expect(page.getByText("Active call with Bob")).toBeVisible();

  await page.evaluate(() => {
    window.__CALL_SERVICE__?.setAudioBlocked(true);
  });
  await expect(page.getByRole("button", { name: "Enable audio" })).toBeVisible();
  await page.getByRole("button", { name: "Hang up" }).click();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("status")).toContainText("Registration: disconnected");
});

test("keyboard operation and narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await openApp(page);
  await page.getByLabel("SIP WebSocket URL").fill("ws://127.0.0.1:7443");
  await page.getByLabel("SIP domain").fill("localhost");
  await page.getByLabel("SIP username").focus();
  await page.keyboard.type("1001");
  await page.getByLabel("SIP password").focus();
  await page.keyboard.type("pw");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Registration: registered");
  await expect(page.getByRole("status")).toBeVisible();
});
