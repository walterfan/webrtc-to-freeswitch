export type MediaFailure = "permission" | "missing-device" | "media";

export type MediaPort = {
  acquire(constraints: MediaStreamConstraints): Promise<MediaStream>;
  attachLocal(stream: MediaStream, videoElement: HTMLVideoElement): Promise<void>;
  attachRemote(
    stream: MediaStream,
    audioElement: HTMLAudioElement,
    videoElement: HTMLVideoElement,
  ): Promise<"playing" | "blocked">;
  enableAudio(audioElement: HTMLAudioElement): Promise<void>;
  setMuted(muted: boolean): boolean;
  isMuted(): boolean;
  detachLocal(videoElement: HTMLVideoElement): void;
  detachRemote(audioElement: HTMLAudioElement, videoElement: HTMLVideoElement): void;
  release(): void;
  localStream(): MediaStream | null;
  acquireCount(): number;
  stopCount(): number;
};
