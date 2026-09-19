import { describe, expect, it } from "vitest";
import { createSipEventHub } from "../ports/sip";
import {
  FakeMedia,
  FakeSipPort,
  audioElement,
  fakeStream,
  fakeUri,
  videoElement,
} from "../test/fakes";
import { appError } from "./errors";
import type { RuntimeConfig } from "../types/domain";
import { CallService } from "./call";

const config: RuntimeConfig = {
  environment: "development",
  sipWebSocketUrl: "ws://127.0.0.1:7443",
  sipDomain: "localhost",
  iceServers: [],
  registration: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 },
  dtmf: { preferredMethod: "rtp" },
};

function setup() {
  const media = new FakeMedia();
  const sip = new FakeSipPort((constraints) => media.acquire(constraints));
  const audio = audioElement();
  const localVideo = videoElement();
  const remoteVideo = videoElement();
  const hub = createSipEventHub();
  sip.bind(hub);
  const service = new CallService(sip, media, fakeUri, audio, localVideo, remoteVideo);
  service.attach(hub);
  return { sip, media, audio, localVideo, remoteVideo, service };
}

describe("CallService", () => {
  it("places an outgoing call and returns to idle after hangup", async () => {
    const { service, sip, media } = setup();
    await service.dial("1002", config);
    expect(service.getState().status).toBe("outgoing-dialing");
    expect(sip.lastInvite).toBe("sip:1002@localhost");
    expect(media.lastConstraints).toEqual({ audio: true, video: false });
    sip.events.onOutgoingAccepted?.("out-sip:1002@localhost");
    await Promise.resolve();
    expect(service.getState().status).toBe("active");
    await service.hangup();
    expect(service.getState().status).toBe("idle");
    expect(media.stops).toBe(1);
  });

  it("places a video call with a local preview and reports remote video", async () => {
    const { service, sip, media, localVideo, remoteVideo } = setup();
    await service.dial("1002", config, "video");
    expect(sip.lastInviteMode).toBe("video");
    expect(media.lastConstraints).toEqual({ audio: true, video: true });
    expect(service.getState().localVideoStatus).toBe("available");
    expect(localVideo.srcObject).toBe(media.localStream());

    sip.events.onOutgoingAccepted?.("out-sip:1002@localhost");
    sip.events.onRemoteStream?.("out-sip:1002@localhost", fakeStream(true));
    await Promise.resolve();
    expect(service.getState().remoteVideoStatus).toBe("available");
    expect(remoteVideo.srcObject).not.toBeNull();
  });

  it("does not create an invitation when video media cannot be acquired", async () => {
    const { service, sip, media } = setup();
    media.acquireError = appError("permission");
    await expect(service.dial("1002", config, "video")).rejects.toMatchObject({
      category: "permission",
      message: expect.stringContaining("Camera"),
    });
    expect(sip.lastInvite).toBeNull();
    expect(service.getState().status).toBe("idle");
  });

  it("keeps audio active when a video destination has no remote video", async () => {
    const { service, sip } = setup();
    await service.dial("1002", config, "video");
    sip.events.onOutgoingAccepted?.("out-sip:1002@localhost");
    sip.events.onRemoteStream?.("out-sip:1002@localhost", fakeStream(false));
    await Promise.resolve();
    expect(service.getState().status).toBe("active");
    expect(service.getState().remoteVideoStatus).toBe("unavailable");
  });

  it("accepts a late current video stream and ignores a stale one", async () => {
    const { service, sip } = setup();
    await service.dial("1002", config, "video");
    const sessionId = "out-sip:1002@localhost";
    sip.events.onOutgoingAccepted?.(sessionId);
    sip.events.onRemoteStream?.(sessionId, fakeStream(false));
    await Promise.resolve();
    expect(service.getState().remoteVideoStatus).toBe("unavailable");

    sip.events.onRemoteStream?.(sessionId, fakeStream(true));
    await Promise.resolve();
    expect(service.getState().remoteVideoStatus).toBe("available");

    sip.events.onRemoteStream?.("stale", fakeStream(false));
    await Promise.resolve();
    expect(service.getState().remoteVideoStatus).toBe("available");
  });

  it("rejects a second outgoing call and a busy incoming invitation", async () => {
    const { service, sip, media } = setup();
    await service.dial("1002", config);
    await expect(service.dial("1003", config)).rejects.toMatchObject({ category: "busy" });
    expect(sip.lastInvite).toBe("sip:1002@localhost");
    sip.emitIncoming();
    expect(sip.rejectedBusy).toHaveLength(1);
    expect(media.acquires).toBe(1);
  });

  it("answers and rejects incoming calls; reject acquires no media", async () => {
    const { service, media, sip } = setup();
    sip.emitIncoming({ displayName: "<script>x</script>", uri: "sip:1002@localhost" });
    expect(service.getState().status).toBe("incoming-ringing");
    expect(service.getState().remote?.displayName).toBe("<script>x</script>");
    expect(media.acquires).toBe(0);
    await service.reject();
    expect(service.getState().status).toBe("idle");
    expect(media.acquires).toBe(0);

    sip.emitIncoming();
    await service.answer();
    expect(service.getState().status).toBe("active");
    expect(media.acquires).toBe(1);
  });

  it("ignores stale termination and supports cancel", async () => {
    const { service, sip } = setup();
    await service.dial("1002", config);
    sip.events.onSessionTerminated?.("stale");
    expect(service.getState().status).toBe("outgoing-dialing");
    await service.cancel();
    expect(service.getState().status).toBe("idle");
  });

  it("sends valid DTMF only during an active call and falls back to INFO", async () => {
    const { service, sip } = setup();
    await service.sendDtmf("1", "rtp");
    expect(service.lastDtmfDigit).toBeNull();
    await service.dial("1002", config);
    sip.events.onOutgoingAccepted?.("out-sip:1002@localhost");
    await Promise.resolve();
    await service.sendDtmf("A", "rtp");
    expect(service.lastDtmfDigit).toBeNull();
    await service.sendDtmf("5", "rtp");
    expect(service.lastDtmfDigit).toBe("5");
    expect(service.lastDtmfMethod).toBe("rtp");
    sip.telephoneEvent = false;
    await service.sendDtmf("#", "rtp");
    expect(service.lastDtmfMethod).toBe("info");
  });
});
