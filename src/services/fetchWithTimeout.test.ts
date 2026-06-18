import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/services/fetchWithTimeout";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("przerywa zapytanie po przekroczeniu limitu czasu", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const request = expect(fetchWithTimeout("https://example.test", {}, 100)).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(100);

    await request;
  });
});
