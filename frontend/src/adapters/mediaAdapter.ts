import { appError, categoryFromMediaError } from "../services/errors";
import type { MediaPort } from "../ports/media";

export type GetUserMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

export class BrowserMediaAdapter implements MediaPort {
  private stream: MediaStream | null = null;
  private muted = false;
  private stopped = false;
  private acquires = 0;
  private stops = 0;

  constructor(private readonly getUserMedia: GetUserMedia) {}

  acquireCount(): number {
    return this.acquires;
  }

  stopCount(): number {
    return this.stops;
  }

  localStream(): MediaStream | null {
    return this.stream;
  }

  async acquire(constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.acquires += 1;
    try {
      this.stream = await this.getUserMedia({
        audio: constraints.audio === true,
        video: constraints.video === true,
      });
      this.stopped = false;
      this.muted = false;
      return this.stream;
    } catch (error) {
      this.stream = null;
      throw appError(categoryFromMediaError(error));
    }
  }

  async attachLocal(stream: MediaStream, videoElement: HTMLVideoElement): Promise<void> {
    if (!hasLiveTrack(tracksOf(stream, "video"))) {
      this.detachLocal(videoElement);
      return;
    }
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = stream;
    await videoElement.play().catch(() => undefined);
  }

  async attachRemote(
    stream: MediaStream,
    audioElement: HTMLAudioElement,
    videoElement: HTMLVideoElement,
  ): Promise<"playing" | "blocked"> {
    const audio = streamForTracks(stream, tracksOf(stream, "audio"));
    const video = streamForTracks(stream, tracksOf(stream, "video"));
    if (!audio) {
      this.detachAudio(audioElement);
    } else {
      audioElement.srcObject = audio;
    }
    if (!video) {
      this.detachLocal(videoElement);
    } else {
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.srcObject = video;
      await videoElement.play().catch(() => undefined);
    }
    if (!audio) {
      return "playing";
    }
    try {
      await audioElement.play();
      return "playing";
    } catch {
      return "blocked";
    }
  }

  async enableAudio(audioElement: HTMLAudioElement): Promise<void> {
    await audioElement.play();
  }

  setMuted(muted: boolean): boolean {
    this.muted = muted;
    for (const track of this.stream?.getAudioTracks() ?? []) {
      track.enabled = !muted;
    }
    return this.isMuted();
  }

  isMuted(): boolean {
    const tracks = this.stream?.getAudioTracks() ?? [];
    if (tracks.length === 0) {
      return this.muted;
    }
    return tracks.every((track) => !track.enabled);
  }

  detachLocal(videoElement: HTMLVideoElement): void {
    videoElement.pause();
    videoElement.srcObject = null;
  }

  detachRemote(audioElement: HTMLAudioElement, videoElement: HTMLVideoElement): void {
    this.detachAudio(audioElement);
    this.detachLocal(videoElement);
  }

  private detachAudio(audioElement: HTMLAudioElement): void {
    audioElement.pause();
    audioElement.srcObject = null;
  }

  release(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.stops += 1;
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.muted = false;
  }
}

function hasLiveTrack(tracks: MediaStreamTrack[]): boolean {
  return tracks.some((track) => track.readyState !== "ended");
}

function tracksOf(stream: MediaStream, kind: "audio" | "video"): MediaStreamTrack[] {
  const getter = kind === "audio" ? stream.getAudioTracks : stream.getVideoTracks;
  return getter ? getter.call(stream) : [];
}

function streamForTracks(source: MediaStream, tracks: MediaStreamTrack[]): MediaStream | null {
  const liveTracks = tracks.filter((track) => track.readyState !== "ended");
  if (liveTracks.length === 0) {
    return null;
  }
  if (typeof MediaStream === "undefined") {
    return source;
  }
  return new MediaStream(liveTracks);
}
