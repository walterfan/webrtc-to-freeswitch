export type MediaFailure = "permission" | "missing-device" | "media";

export type MediaPort = {
  acquireMicrophone(): Promise<MediaStream>;
  attachRemote(stream: MediaStream, audioElement: HTMLAudioElement): Promise<"playing" | "blocked">;
  enableAudio(audioElement: HTMLAudioElement): Promise<void>;
  setMuted(muted: boolean): boolean;
  isMuted(): boolean;
  detachRemote(audioElement: HTMLAudioElement): void;
  release(): void;
  localStream(): MediaStream | null;
  acquireCount(): number;
  stopCount(): number;
};
