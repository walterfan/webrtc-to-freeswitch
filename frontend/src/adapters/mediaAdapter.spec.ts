import { describe, expect, it, vi } from "vitest";
import { BrowserMediaAdapter } from "./mediaAdapter";

function track(enabled = true) {
  return {
    kind: "audio",
    enabled,
    readyState: "live",
    stop: vi.fn(),
  };
}

function videoTrack() {
  return { ...track(), kind: "video" };
}

function stream(tracks = [track()]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
    getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
  } as unknown as MediaStream;
}

function videoElement() {
  return {
    srcObject: null,
    muted: false,
    playsInline: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe("BrowserMediaAdapter", () => {
  it("requests audio only and cleans up a failed call once", async () => {
    const gum = vi.fn().mockResolvedValue(stream());
    const adapter = new BrowserMediaAdapter(gum);
    await adapter.acquire({ audio: true, video: false });
    expect(gum).toHaveBeenCalledWith({ audio: true, video: false });
    adapter.release();
    adapter.release();
    expect(adapter.stopCount()).toBe(1);
  });

  it("maps permission and missing-device failures", async () => {
    const denied = new BrowserMediaAdapter(
      vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
    );
    await expect(denied.acquire({ audio: true, video: true })).rejects.toMatchObject({
      category: "permission",
    });
    const missing = new BrowserMediaAdapter(
      vi.fn().mockRejectedValue(Object.assign(new Error("none"), { name: "NotFoundError" })),
    );
    await expect(missing.acquire({ audio: true, video: true })).rejects.toMatchObject({
      category: "missing-device",
    });
  });

  it("attaches remote audio and reports blocked autoplay", async () => {
    const adapter = new BrowserMediaAdapter(vi.fn());
    const playingEl = {
      srcObject: null,
      play: vi.fn().mockResolvedValue(undefined),
    } as unknown as HTMLAudioElement;
    const blockedEl = {
      srcObject: null,
      play: vi.fn().mockRejectedValue(new Error("autoplay")),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    await expect(adapter.attachRemote(stream(), playingEl, videoElement())).resolves.toBe(
      "playing",
    );
    const blockedVideo = videoElement();
    await expect(adapter.attachRemote(stream(), blockedEl, blockedVideo)).resolves.toBe("blocked");
    adapter.detachRemote(blockedEl, blockedVideo);
    expect(blockedEl.srcObject).toBeNull();
  });

  it("uses muted video elements and detaches them with remote media", async () => {
    const adapter = new BrowserMediaAdapter(vi.fn());
    const audio = {
      srcObject: null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
    } as unknown as HTMLAudioElement;
    const local = videoElement();
    const remote = videoElement();
    const localStream = stream([track(), videoTrack()]);
    await adapter.attachLocal(localStream, local);
    await adapter.attachRemote(localStream, audio, remote);
    expect(local.muted).toBe(true);
    expect(remote.muted).toBe(true);
    expect(remote.srcObject).not.toBeNull();
    adapter.detachRemote(audio, remote);
    expect(remote.srcObject).toBeNull();
  });

  it("mute reflects actual track state", async () => {
    const audioTrack = track(true);
    const adapter = new BrowserMediaAdapter(vi.fn().mockResolvedValue(stream([audioTrack])));
    await adapter.acquire({ audio: true, video: false });
    expect(adapter.setMuted(true)).toBe(true);
    expect(audioTrack.enabled).toBe(false);
    expect(adapter.setMuted(false)).toBe(false);
    expect(audioTrack.enabled).toBe(true);
  });
});
