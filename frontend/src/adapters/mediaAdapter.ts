import { categoryFromMediaError } from "../services/errors";
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

  async acquireMicrophone(): Promise<MediaStream> {
    this.acquires += 1;
    try {
      this.stream = await this.getUserMedia({ audio: true, video: false });
      this.stopped = false;
      this.muted = false;
      return this.stream;
    } catch (error) {
      this.stream = null;
      throw { category: categoryFromMediaError(error) };
    }
  }

  async attachRemote(
    stream: MediaStream,
    audioElement: HTMLAudioElement,
  ): Promise<"playing" | "blocked"> {
    audioElement.srcObject = stream;
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

  detachRemote(audioElement: HTMLAudioElement): void {
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
