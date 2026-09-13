/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FAKE_SIGNALING?: string;
}

interface Window {
  __USE_FAKE_SIGNALING__?: boolean;
  __FAKE_SIP__?: import("./ports/sip").SipPort;
  __FAKE_MEDIA__?: import("./ports/media").MediaPort;
  __CALL_SERVICE__?: {
    getState(): { sessionId: string | null };
    setAudioBlocked(blocked: boolean): void;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
