import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SipTraceMessage } from "../ports/sip";
import SipTracePane from "./SipTracePane.vue";

const messages: SipTraceMessage[] = [
  {
    id: "s1",
    direction: "send",
    at: 2,
    raw: 'REGISTER sip:localhost SIP/2.0\r\nAuthorization: Digest response="SECRET"\r\n\r\n',
  },
  {
    id: "r1",
    direction: "receive",
    at: 1,
    raw: "SIP/2.0 401 Unauthorized\r\nCall-ID: abc\r\n\r\n<script>alert(1)</script>",
  },
];

describe("SipTracePane", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows direction icons, start lines, expand, filter, sort, and clear", async () => {
    const wrapper = mount(SipTracePane, {
      props: { messages, filter: "", order: "desc" },
    });
    expect(wrapper.get('[data-testid="sip-trace-send"]').attributes("aria-label")).toBe("send");
    expect(wrapper.get('[data-testid="sip-trace-receive"]').attributes("aria-label")).toBe(
      "receive",
    );
    expect(wrapper.text()).toContain("REGISTER sip:localhost SIP/2.0");
    expect(wrapper.text()).not.toContain('response="SECRET"');
    const rows = wrapper.findAll('[data-testid="sip-trace-row"]');
    await rows[0]?.trigger("click");
    expect(wrapper.text()).toContain('response="SECRET"');
    expect(wrapper.find("script").exists()).toBe(false);
    await rows[0]?.trigger("click");
    expect(wrapper.text()).not.toContain('response="SECRET"');
    await wrapper.get('[data-testid="sip-trace-filter"]').setValue("Call-ID: abc");
    expect(wrapper.emitted("update:filter")?.at(-1)).toEqual(["Call-ID: abc"]);
    await wrapper.get('[data-testid="sip-trace-order"]').trigger("click");
    expect(wrapper.emitted("update:order")?.at(-1)).toEqual(["asc"]);
    await wrapper.get('[data-testid="sip-trace-clear"]').trigger("click");
    expect(wrapper.emitted("clear")).toBeTruthy();
  });

  it("exports the displayed messages as a markdown download", async () => {
    const click = vi.fn();
    const anchor = {
      href: "",
      download: "",
      click,
      setAttribute: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const createObjectURL = vi.fn(() => "blob:sip-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      if (tagName === "a") {
        return anchor;
      }
      return originalCreateElement(tagName, options);
    }) as typeof document.createElement);
    const append = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    const remove = vi.spyOn(document.body, "removeChild").mockImplementation((node) => node);

    const wrapper = mount(SipTracePane, {
      props: { messages, filter: "", order: "desc" },
    });
    await wrapper.get('[data-testid="sip-trace-export"]').trigger("click");

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(text).toContain("# SIP message export");
    expect(text.indexOf("REGISTER sip:localhost SIP/2.0")).toBeLessThan(
      text.indexOf("SIP/2.0 401 Unauthorized"),
    );
    expect(anchor.download).toMatch(/^sip-messages-.*\.md$/);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:sip-export");
    expect(createElement).toHaveBeenCalled();
    expect(append).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
