<template>
  <section class="panel sip-trace" aria-labelledby="sip-trace-heading">
    <h2 id="sip-trace-heading">SIP messages</h2>
    <div class="sip-trace-toolbar">
      <label>
        Filter
        <input
          data-testid="sip-trace-filter"
          :value="filter"
          placeholder="Call-ID: xxx"
          autocomplete="off"
          @input="onFilter"
        />
      </label>
      <button
        type="button"
        class="secondary"
        data-testid="sip-trace-order"
        :title="order === 'desc' ? 'Showing newest first' : 'Showing oldest first'"
        @click="toggleOrder"
      >
        {{ order === "desc" ? "Newest first" : "Oldest first" }}
      </button>
      <button type="button" class="secondary" data-testid="sip-trace-clear" @click="$emit('clear')">
        Clear
      </button>
      <button
        type="button"
        class="secondary"
        data-testid="sip-trace-export"
        :disabled="messages.length === 0"
        @click="exportMarkdown"
      >
        Export
      </button>
    </div>
    <ol class="sip-trace-list">
      <li v-for="message in messages" :key="message.id">
        <button
          type="button"
          class="sip-trace-row"
          data-testid="sip-trace-row"
          :aria-expanded="expandedId === message.id"
          @click="toggle(message.id)"
        >
          <span
            class="sip-trace-icon"
            :class="message.direction"
            :data-testid="`sip-trace-${message.direction}`"
            :aria-label="message.direction === 'send' ? 'send' : 'receive'"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path
                v-if="message.direction === 'send'"
                d="M3 13 L13 3 M7 3 H13 V9"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                v-else
                d="M13 3 L3 13 M9 13 H3 V7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="sip-trace-summary">{{ startLine(message.raw) }}</span>
        </button>
        <pre v-if="expandedId === message.id" class="sip-trace-raw">{{ message.raw }}</pre>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { SipTraceMessage } from "../ports/sip";
import { formatSipTraceMarkdown, startLine, type SipTraceOrder } from "../services/sipTrace";

const props = defineProps<{
  messages: SipTraceMessage[];
  filter: string;
  order: SipTraceOrder;
}>();

const emit = defineEmits<{
  "update:filter": [value: string];
  "update:order": [value: SipTraceOrder];
  clear: [];
}>();

const expandedId = ref<string | null>(null);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function onFilter(event: Event) {
  emit("update:filter", (event.target as HTMLInputElement).value);
}

function toggleOrder() {
  emit("update:order", props.order === "desc" ? "asc" : "desc");
}

function exportMarkdown() {
  const markdown = formatSipTraceMarkdown(props.messages);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sip-messages-${stamp}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
</script>
