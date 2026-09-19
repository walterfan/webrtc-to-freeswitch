import { BrowserMediaAdapter } from "../adapters/mediaAdapter";
import { createSipUriBuilder, SipJsAdapter } from "../adapters/sipAdapter";
import { RuntimeConfigClient } from "../config/runtimeConfig";
import { createSipEventHub } from "../ports/sip";
import { CallService } from "../services/call";
import { browserCapabilityEnv } from "../services/capabilities";
import { RegistrationService } from "../services/registration";
import { SipTraceService } from "../services/sipTrace";
import { FakeMedia, FakeSipPort, fakeUri } from "../test/fakes";

export function createAppServices(
  audioElement: HTMLAudioElement,
  localVideoElement: HTMLVideoElement,
  remoteVideoElement: HTMLVideoElement,
) {
  const fakeMode =
    import.meta.env.VITE_FAKE_SIGNALING === "1" ||
    (typeof window !== "undefined" && Boolean(window.__USE_FAKE_SIGNALING__));
  const configClient = new RuntimeConfigClient();
  const hub = createSipEventHub();
  const media = fakeMode
    ? new FakeMedia()
    : new BrowserMediaAdapter((constraints) => navigator.mediaDevices.getUserMedia(constraints));
  const sip = fakeMode
    ? new FakeSipPort((constraints) => media.acquire(constraints))
    : new SipJsAdapter({ mediaStreamFactory: (constraints) => media.acquire(constraints) });
  const uri = fakeMode ? fakeUri : createSipUriBuilder();
  sip.bind(hub);
  const sipTrace = new SipTraceService();
  sipTrace.attach(hub);
  const registration = new RegistrationService(sip, undefined, browserCapabilityEnv);
  const call = new CallService(
    sip,
    media,
    uri,
    audioElement,
    localVideoElement,
    remoteVideoElement,
  );
  registration.attach(hub);
  call.attach(hub);
  if (fakeMode && typeof window !== "undefined") {
    window.__FAKE_SIP__ = sip;
    window.__FAKE_MEDIA__ = media;
    window.__CALL_SERVICE__ = call;
  }
  return { configClient, registration, call, sip, media, sipTrace, fakeMode };
}
