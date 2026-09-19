<template>
  <div class="app-layout" :style="{ '--console-width': `${consoleWidth}px` }">
    <div class="app-shell">
      <header class="panel">
        <h1>WebRTC to FreeSWITCH</h1>
        <p class="status-line" role="status" aria-live="polite">{{ statusText }}</p>
        <p v-if="configState.status === 'failed'" class="hint">
          {{ configState.error }}
          <button type="button" data-testid="retry-config" @click="retryConfig">
            Retry configuration
          </button>
        </p>
        <p v-if="unsupported" class="hint">
          This browser or page context does not support WebRTC calling.
        </p>
        <p v-if="audioBlocked" class="hint">
          Remote audio is blocked by the browser.
          <button type="button" @click="enableAudio">Enable audio</button>
        </p>
      </header>

      <section class="panel" aria-labelledby="reg-heading">
        <h2 id="reg-heading">Registration</h2>
        <form class="row" @submit.prevent="connect">
          <label>
            SIP WebSocket URL
            <input
              v-model="sipWebSocketUrl"
              name="sipWebSocketUrl"
              autocomplete="off"
              placeholder="wss://freeswitch.example:7443"
              :disabled="!canEditCredentials"
            />
          </label>
          <label>
            SIP domain
            <input
              v-model="sipDomain"
              name="sipDomain"
              autocomplete="off"
              placeholder="freeswitch.example"
              :disabled="!canEditCredentials"
            />
          </label>
          <label>
            SIP username
            <input
              v-model="username"
              name="username"
              autocomplete="username"
              :disabled="!canEditCredentials"
            />
          </label>
          <label>
            SIP password
            <input
              v-model="password"
              name="password"
              type="password"
              autocomplete="current-password"
              :disabled="!canEditCredentials"
            />
          </label>
          <button type="submit" data-testid="connect" :disabled="!canConnect" :title="connectTitle">
            Connect
          </button>
          <button
            type="button"
            class="secondary"
            data-testid="disconnect"
            :disabled="!canDisconnect"
            :title="disconnectTitle"
            @click="disconnect"
          >
            Disconnect
          </button>
          <button
            v-if="registration.status === 'failed'"
            type="button"
            :disabled="!canConnect"
            @click="connect"
          >
            Retry
          </button>
        </form>
        <p class="hint">
          Endpoint, username, and password stay in memory only; the password must be re-entered
          after reload.
        </p>
        <p v-if="registration.error" class="hint">{{ registration.error.message }}</p>
      </section>

      <section class="panel" aria-labelledby="call-heading">
        <h2 id="call-heading">Call</h2>
        <form class="row" @submit.prevent="dial('audio')">
          <label>
            Destination
            <input
              v-model="destination"
              name="destination"
              autocomplete="off"
              :disabled="!canDial"
            />
          </label>
          <button type="submit" :disabled="!canDial" :title="audioDialTitle">Audio call</button>
          <button type="button" :disabled="!canDial" :title="videoDialTitle" @click="dial('video')">
            Video call
          </button>
        </form>
        <p v-if="call.error" class="hint">{{ call.error.message }}</p>

        <section v-show="call.mediaMode === 'video'" class="video-stage" aria-label="Video call">
          <p v-if="call.remoteVideoStatus === 'unavailable'" class="hint" role="status">
            Remote video is unavailable. The audio call remains active.
          </p>
          <video
            ref="remoteVideo"
            class="remote-video"
            aria-label="Remote call video"
            autoplay
            muted
            playsinline
          />
          <video
            ref="localVideo"
            class="local-video"
            aria-label="Local camera preview"
            autoplay
            muted
            playsinline
          />
        </section>

        <article v-if="call.status === 'incoming-ringing'" aria-live="polite">
          <p>Incoming call from {{ call.remote?.displayName }}</p>
          <div class="row">
            <button type="button" data-testid="answer" @click="answer">Answer</button>
            <button type="button" class="secondary" data-testid="reject" @click="reject">
              Reject
            </button>
          </div>
        </article>

        <article v-if="isOutgoing" aria-live="polite">
          <p>Calling {{ call.remote?.displayName }} ({{ call.status }})</p>
          <button type="button" class="danger" @click="cancel">Cancel</button>
        </article>

        <article v-if="call.status === 'active'">
          <p>Active call with {{ call.remote?.displayName }}</p>
          <div class="row">
            <button type="button" class="secondary" @click="toggleMute">
              {{ muted ? "Unmute" : "Mute" }}
            </button>
            <button type="button" class="danger" @click="hangup">Hang up</button>
          </div>
          <div class="dtmf-pad" role="group" aria-label="DTMF keypad">
            <button
              v-for="digit in digits"
              :key="digit"
              type="button"
              :disabled="!canDtmf"
              @click="sendDtmf(digit)"
            >
              {{ digit }}
            </button>
          </div>
        </article>
      </section>

      <audio ref="remoteAudio" class="remote-audio" aria-label="Remote call audio" autoplay />
    </div>
    <div
      class="pane-divider"
      role="separator"
      aria-label="Resize call console and SIP messages"
      aria-orientation="vertical"
      :aria-valuenow="consoleWidth"
      aria-valuemin="288"
      aria-valuemax="832"
      tabindex="0"
      @mousedown="startResize"
      @keydown="resizeWithKeyboard"
    />
    <SipTracePane
      :messages="trace.messages"
      :filter="trace.filter"
      :order="trace.order"
      @update:filter="setTraceFilter"
      @update:order="setTraceOrder"
      @clear="clearTrace"
    />
    <footer class="site-footer">
      <span>© {{ copyrightYear }} Walter Fan</span>
      <a href="https://www.fanyamin.com" target="_blank" rel="noreferrer"> www.fanyamin.com </a>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { createAppServices } from "../app/createAppServices";
import { inspectCapabilities, browserCapabilityEnv } from "../services/capabilities";
import type { CallState } from "../state/call";
import type { RegistrationState } from "../state/registration";
import type { RuntimeConfigState } from "../config/runtimeConfig";
import { type SipTraceOrder, type SipTraceState } from "../services/sipTrace";
import { mergeSessionConfig } from "../services/sipEndpoint";
import SipTracePane from "./SipTracePane.vue";

const remoteAudio = ref<HTMLAudioElement | null>(null);
const localVideo = ref<HTMLVideoElement | null>(null);
const remoteVideo = ref<HTMLVideoElement | null>(null);
const sipWebSocketUrl = ref("");
const sipDomain = ref("");
const username = ref("");
const password = ref("");
const destination = ref("");
const muted = ref(false);
const unsupported = ref(false);
const audioBlocked = ref(false);
const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const copyrightYear = new Date().getFullYear();

const configState = reactive<RuntimeConfigState>({
  status: "loading",
  config: null,
  error: null,
  sipActionsEnabled: false,
});
const registration = reactive<RegistrationState>({
  status: "disconnected",
  error: null,
  retryAttempt: 0,
});
const call = reactive<CallState>({
  status: "idle",
  sessionId: null,
  direction: null,
  remote: null,
  error: null,
  endReason: null,
  mediaMode: null,
  localVideoStatus: "not-applicable",
  remoteVideoStatus: "not-applicable",
});
const trace = reactive<SipTraceState>({
  messages: [],
  filter: "",
  order: "desc",
});
const consoleWidth = ref(640);

let services: ReturnType<typeof createAppServices> | null = null;

const statusText = computed(() => {
  if (configState.status === "loading") {
    return "Loading runtime configuration.";
  }
  if (configState.status === "failed") {
    return "Configuration failed.";
  }
  if (unsupported.value) {
    return "Unsupported browser context.";
  }
  const video =
    call.mediaMode === "video" && call.remoteVideoStatus === "unavailable"
      ? " Remote video is unavailable; audio remains active."
      : "";
  return `Service ready. Registration: ${registration.status}. Call: ${call.status}.${video}`;
});

const canEditCredentials = computed(
  () => registration.status === "disconnected" || registration.status === "failed",
);
const canConnect = computed(
  () =>
    configState.sipActionsEnabled &&
    !unsupported.value &&
    canEditCredentials.value &&
    sipWebSocketUrl.value.trim().length > 0 &&
    sipDomain.value.trim().length > 0 &&
    username.value.length > 0 &&
    password.value.length > 0,
);
const canDisconnect = computed(
  () => registration.status === "registered" && call.status === "idle",
);
const canDial = computed(
  () =>
    registration.status === "registered" && call.status === "idle" && configState.sipActionsEnabled,
);
const canDtmf = computed(() => call.status === "active");
const isOutgoing = computed(
  () => call.status === "outgoing-dialing" || call.status === "outgoing-ringing",
);
const connectTitle = computed(() =>
  canConnect.value
    ? "Connect and register"
    : "Enter endpoint and credentials after configuration loads",
);
const disconnectTitle = computed(() =>
  canDisconnect.value
    ? "Unregister and close signaling"
    : "Disconnect is available when registered and idle",
);
const audioDialTitle = computed(() =>
  canDial.value ? "Place an audio call" : "Register and wait until idle to place a call",
);
const videoDialTitle = computed(() =>
  canDial.value ? "Place an audio and video call" : "Register and wait until idle to place a call",
);

onMounted(async () => {
  unsupported.value = !inspectCapabilities(browserCapabilityEnv()).ok;
  const audio = remoteAudio.value;
  const local = localVideo.value;
  const remote = remoteVideo.value;
  if (!audio || !local || !remote) {
    return;
  }
  services = createAppServices(audio, local, remote);
  services.configClient.subscribe((state) => {
    Object.assign(configState, state);
    if (state.status === "ready" && state.config) {
      if (!sipWebSocketUrl.value && state.config.sipWebSocketUrl) {
        sipWebSocketUrl.value = state.config.sipWebSocketUrl;
      }
      if (!sipDomain.value && state.config.sipDomain) {
        sipDomain.value = state.config.sipDomain;
      }
    }
  });
  services.registration.subscribe((state) => Object.assign(registration, state));
  services.call.subscribe((state) => {
    Object.assign(call, state);
    audioBlocked.value = services?.call.isAudioBlocked() ?? false;
    muted.value = services?.media.isMuted() ?? false;
  });
  services.sipTrace.subscribe((state) => Object.assign(trace, state));
  await services.configClient.load();
});

onUnmounted(() => {
  stopResize();
  services?.call.dispose();
});

function startResize(event: MouseEvent) {
  if (window.matchMedia("(max-width: 880px)").matches) {
    return;
  }
  event.preventDefault();
  document.addEventListener("mousemove", resize);
  document.addEventListener("mouseup", stopResize);
}

function resize(event: MouseEvent) {
  const layout = document.querySelector<HTMLElement>(".app-layout");
  if (!layout) {
    return;
  }
  const bounds = layout.getBoundingClientRect();
  const min = 288;
  const max = Math.min(832, bounds.width - 320);
  consoleWidth.value = Math.max(min, Math.min(max, event.clientX - bounds.left));
}

function stopResize() {
  document.removeEventListener("mousemove", resize);
  document.removeEventListener("mouseup", stopResize);
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  consoleWidth.value = Math.max(288, Math.min(832, consoleWidth.value + direction * 32));
}

async function retryConfig() {
  await services?.configClient.retry();
}

async function connect() {
  if (!services || !configState.config || !canConnect.value) {
    return;
  }
  try {
    const sessionConfig = mergeSessionConfig(
      configState.config,
      sipWebSocketUrl.value,
      sipDomain.value,
    );
    await services.registration.connect({
      username: username.value,
      password: password.value,
      config: sessionConfig,
    });
    password.value = "";
  } catch (error) {
    registration.error =
      error && typeof error === "object" && "message" in error
        ? (error as RegistrationState["error"])
        : registration.error;
  }
}

async function disconnect() {
  await services?.registration.disconnect();
  password.value = "";
}

async function dial(mediaMode: "audio" | "video") {
  if (!services || !configState.config) {
    return;
  }
  try {
    const sessionConfig = mergeSessionConfig(
      configState.config,
      sipWebSocketUrl.value,
      sipDomain.value,
    );
    await services.call.dial(destination.value, sessionConfig, mediaMode);
  } catch (error) {
    call.error =
      error && typeof error === "object" && "message" in error
        ? (error as CallState["error"])
        : call.error;
  }
}

async function answer() {
  await services?.call.answer();
}

async function reject() {
  await services?.call.reject();
}

async function cancel() {
  await services?.call.cancel();
}

async function hangup() {
  await services?.call.hangup();
}

function toggleMute() {
  muted.value = services?.call.toggleMute() ?? muted.value;
}

async function sendDtmf(digit: string) {
  const preferred = configState.config?.dtmf.preferredMethod ?? "rtp";
  await services?.call.sendDtmf(digit, preferred);
}

async function enableAudio() {
  await services?.call.enableAudio();
  audioBlocked.value = false;
}

function setTraceFilter(value: string) {
  services?.sipTrace.setFilter(value);
}

function setTraceOrder(value: SipTraceOrder) {
  services?.sipTrace.setOrder(value);
}

function clearTrace() {
  services?.sipTrace.clear();
}
</script>
