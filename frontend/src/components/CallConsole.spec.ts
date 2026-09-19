import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerRuntimeConfig } from "../types/domain";
import { fakeStream } from "../test/fakes";
import CallConsole from "./CallConsole.vue";

const validConfig: ServerRuntimeConfig = {
  environment: "development",
  sipWebSocketUrl: "ws://127.0.0.1:7443",
  sipDomain: "localhost",
  iceServers: [],
  registration: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 },
  dtmf: { preferredMethod: "rtp" },
};

function stubBrowser(ok = true) {
  vi.stubGlobal("RTCPeerConnection", ok ? function RTCPeerConnection() {} : undefined);
  Object.defineProperty(window.navigator, "mediaDevices", {
    configurable: true,
    value: ok ? { getUserMedia: vi.fn() } : undefined,
  });
  window.__USE_FAKE_SIGNALING__ = true;
}

function mockConfig(ok: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      ok
        ? new Response(JSON.stringify(validConfig), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        : new Response("nope", { status: 500 }),
    ),
  );
}

describe("CallConsole", () => {
  beforeEach(() => {
    stubBrowser(true);
  });

  afterEach(() => {
    window.__USE_FAKE_SIGNALING__ = false;
    vi.unstubAllGlobals();
  });

  it("shows loading then ready, and recovers from configuration failure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validConfig), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const wrapper = mount(CallConsole);
    expect(wrapper.text()).toContain("Loading runtime configuration");
    await flushPromises();
    expect(wrapper.text()).toContain("Configuration failed");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="retry-config"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Service ready");
  });

  it("identifies an unsupported browser", async () => {
    stubBrowser(false);
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    expect(wrapper.text()).toContain("does not support WebRTC");
  });

  it("renders the copyright and contact link in the bottom bar", () => {
    const wrapper = mount(CallConsole);
    const link = wrapper.get(".site-footer a");
    expect(wrapper.get(".site-footer").text()).toContain(
      `© ${new Date().getFullYear()} Walter Fan`,
    );
    expect(link.attributes("href")).toBe("https://www.fanyamin.com");
    expect(link.attributes("target")).toBe("_blank");
  });

  it("gates connect, clears the password, and prevents duplicate connects", async () => {
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    await wrapper.get('input[name="sipWebSocketUrl"]').setValue("ws://127.0.0.1:7443");
    await wrapper.get('input[name="sipDomain"]').setValue("localhost");
    const user = wrapper.get('input[name="username"]');
    const pass = wrapper.get('input[name="password"]');
    await user.setValue("1001");
    await pass.setValue("SENTINEL_PW");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect((pass.element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).toContain("Registration: registered");
    expect(wrapper.get("button[type='submit']").attributes("disabled")).toBeDefined();
  });

  it("renders untrusted caller names as text and exposes call controls", async () => {
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    await wrapper.get('input[name="sipWebSocketUrl"]').setValue("ws://127.0.0.1:7443");
    await wrapper.get('input[name="sipDomain"]').setValue("localhost");
    await wrapper.get('input[name="username"]').setValue("1001");
    await wrapper.get('input[name="password"]').setValue("pw");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const sip = window.__FAKE_SIP__ as import("../test/fakes").FakeSipPort;
    sip.emitIncoming({ displayName: "<img src=x onerror=alert(1)>", uri: "sip:9@localhost" });
    await flushPromises();
    expect(wrapper.text()).toContain("<img src=x onerror=alert(1)>");
    expect(wrapper.find("img").exists()).toBe(false);
    await wrapper.get('[data-testid="reject"]').trigger("click");
    await flushPromises();
    await wrapper.get('input[name="destination"]').setValue("1002");
    await wrapper.findAll("form")[1].trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Calling 1002");
  });

  it("offers an enable-audio action when playback is blocked", async () => {
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    await wrapper.get('input[name="sipWebSocketUrl"]').setValue("ws://127.0.0.1:7443");
    await wrapper.get('input[name="sipDomain"]').setValue("localhost");
    await wrapper.get('input[name="username"]').setValue("1001");
    await wrapper.get('input[name="password"]').setValue("pw");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const sip = window.__FAKE_SIP__ as import("../test/fakes").FakeSipPort;
    const media = window.__FAKE_MEDIA__ as import("../test/fakes").FakeMedia;
    media.playBlocked = true;
    sip.emitIncoming();
    await flushPromises();
    await wrapper.get('[data-testid="answer"]').trigger("click");
    await flushPromises();
    sip.events.onRemoteStream?.("in-1", fakeStream(false));
    await flushPromises();
    expect(wrapper.text()).toContain("Enable audio");
  });

  it("offers explicit audio and video call actions with a video preview", async () => {
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    await wrapper.get('input[name="sipWebSocketUrl"]').setValue("ws://127.0.0.1:7443");
    await wrapper.get('input[name="sipDomain"]').setValue("localhost");
    await wrapper.get('input[name="username"]').setValue("1001");
    await wrapper.get('input[name="password"]').setValue("pw");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await wrapper.get('input[name="destination"]').setValue("1002");
    expect(wrapper.get('button[type="submit"]').text()).toBe("Connect");
    expect(wrapper.text()).toContain("Audio call");
    await wrapper.get('button[title="Place an audio and video call"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".video-stage").isVisible()).toBe(true);
    const sip = window.__FAKE_SIP__ as import("../test/fakes").FakeSipPort;
    sip.events.onOutgoingAccepted?.("out-sip:1002@localhost");
    sip.events.onRemoteStream?.("out-sip:1002@localhost", fakeStream(false));
    await flushPromises();
    expect(wrapper.text()).toContain("Remote video is unavailable");
  });

  it("keeps SIP messages after disconnect and clears them on request", async () => {
    mockConfig(true);
    const wrapper = mount(CallConsole);
    await flushPromises();
    await wrapper.get('input[name="sipWebSocketUrl"]').setValue("ws://127.0.0.1:7443");
    await wrapper.get('input[name="sipDomain"]').setValue("localhost");
    await wrapper.get('input[name="username"]').setValue("1001");
    await wrapper.get('input[name="password"]').setValue("pw");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const sip = window.__FAKE_SIP__ as import("../test/fakes").FakeSipPort;
    sip.emitSipMessage({
      direction: "send",
      raw: "REGISTER sip:localhost SIP/2.0\r\nCall-ID: keep-me\r\n\r\n",
    });
    await flushPromises();
    expect(wrapper.text()).toContain("REGISTER sip:localhost SIP/2.0");
    await wrapper.get('[data-testid="disconnect"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Registration: disconnected");
    expect(wrapper.text()).toContain("REGISTER sip:localhost SIP/2.0");
    await wrapper.get('[data-testid="sip-trace-clear"]').trigger("click");
    expect(wrapper.text()).not.toContain("REGISTER sip:localhost SIP/2.0");
  });
});
