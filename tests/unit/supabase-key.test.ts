import { describe, expect, it } from "vitest";
import { isPublishableKey } from "@/lib/supabase-key";

// W-8 of the security review (context/archive/2026-11-16-security-hardening/plan.md, Faza 2 #5): the Worker makes no
// Supabase client, and hands the browser no Realtime config, unless SUPABASE_KEY is the publishable key. The oracle is
// AGENTS.md (Hard Rules: the publishable key, sb_publishable_…; a secret or service_role key never goes to the
// browser), with Supabase's key formats written out here.

describe("isPublishableKey", () => {
  it.each(["sb_publishable_AbCdEf123_-xyz", "sb_publishable_x"])("takes the publishable key %s", (key) => {
    expect(isPublishableKey(key)).toBe(true);
  });

  it.each([
    { why: "a secret key", key: "sb_secret_AbCdEf123_-xyz" },
    // A legacy JWT key, anon or service_role alike: the Worker never runs on one.
    { why: "a legacy JWT key", key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2ln" },
    { why: "an empty key", key: "" },
    { why: "no key", key: undefined },
    { why: "the prefix in another case", key: "SB_PUBLISHABLE_AbCdEf" },
    { why: "the prefix after a space", key: " sb_publishable_AbCdEf" },
    { why: "the prefix inside another key", key: "sb_secret_sb_publishable_AbCdEf" },
  ])("refuses $why", ({ key }) => {
    expect(isPublishableKey(key)).toBe(false);
  });
});
