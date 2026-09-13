import { describe, expect, it, vi } from "vitest";
import { BrowserMediaAdapter } from "./mediaAdapter";

function track(enabled = true) {
  return {
    kind: "audio",
    enabled,
    stop: vi.fn(),
  };
}

function stream(tracks = [track()]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  } as unknown as MediaStream;
}

describe("BrowserMediaAdapter", () => {
  it("requests audio only and cleans up a failed call once", async () => {
    const gum = vi.fn().mockResolvedValue(stream());
    const adapter = new BrowserMediaAdapter(gum);
    await adapter.acquireMicrophone();
    expect(gum).toHaveBeenCalledWith({ audio: true, video: false });
    adapter.release();
    adapter.release();
    expect(adapter.stopCount()).toBe(1);
  });

  it("maps permission and missing-device failures", async () => {
    const denied = new BrowserMediaAdapter(
      vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
    );
    await expect(denied.acquireMicrophone()).rejects.toMatchObject({ category: "permission" });
    const missing = new BrowserMediaAdapter(
      vi.fn().mockRejectedValue(Object.assign(new Error("none"), { name: "NotFoundError" })),
    );
    await expect(missing.acquireMicrophone()).rejects.toMatchObject({
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
    await expect(adapter.attachRemote(stream(), playingEl)).resolves.toBe("playing");
    await expect(adapter.attachRemote(stream(), blockedEl)).resolves.toBe("blocked");
    adapter.detachRemote(blockedEl);
    expect(blockedEl.srcObject).toBeNull();
  });

  it("mute reflects actual track state", async () => {
    const audioTrack = track(true);
    const adapter = new BrowserMediaAdapter(vi.fn().mockResolvedValue(stream([audioTrack])));
    await adapter.acquireMicrophone();
    expect(adapter.setMuted(true)).toBe(true);
    expect(audioTrack.enabled).toBe(false);
    expect(adapter.setMuted(false)).toBe(false);
    expect(audioTrack.enabled).toBe(true);
  });
});
