import { describe, expect, test } from "bun:test";
import {
  calculateThreatScore,
  selectRelationshipMix,
} from "@/lib/competitor-intelligence/scoring";
import {
  isCompetitorResearchJob,
  normalizeHttpUrl,
  normalizeResearchCandidates,
  normalizeSignal,
} from "@/lib/competitor-intelligence/validation";
import { nextDailyRun, retentionDue } from "@/lib/competitor-intelligence/schedule";
import {
  queueAutoStartCopy,
  queuePositionFromAheadCounts,
  queuePositionLabel,
} from "@/lib/queue-position";
import { isUuid } from "@/lib/validation";

describe("shared worker queue copy", () => {
  test("reports the next and later positions consistently", () => {
    expect(queuePositionLabel(1)).toBe("Next in line");
    expect(queuePositionLabel(4)).toBe("#4 in line");
    expect(queuePositionLabel(null)).toBe("Waiting in line");
    expect(queueAutoStartCopy("research worker")).toBe(
      "Starts automatically when the research worker is available",
    );
    expect(queuePositionFromAheadCounts(2, 1)).toBe(4);
    expect(() => queuePositionFromAheadCounts(-1, 0)).toThrow();
  });
});

describe("competitor threat scoring", () => {
  test("uses the locked deterministic weights", () => {
    expect(
      calculateThreatScore({
        customer_overlap: 90,
        product_substitutability: 80,
        momentum: 70,
        distribution_overlap: 60,
        evidence_quality: 50,
      }),
    ).toBe(75);
  });

  test("enforces the 4/3/3 relationship mix without padding", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) => ({
        relationship: "direct" as const,
        threat_score: 100 - index,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        relationship: "indirect" as const,
        threat_score: 90 - index,
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        relationship: "emerging" as const,
        threat_score: 80 - index,
      })),
    ];
    const selected = selectRelationshipMix(candidates);
    expect(selected).toHaveLength(10);
    expect(selected.filter((item) => item.relationship === "direct")).toHaveLength(4);
    expect(selected.filter((item) => item.relationship === "indirect")).toHaveLength(3);
    expect(selected.filter((item) => item.relationship === "emerging")).toHaveLength(3);
  });
});

describe("evidence validation", () => {
  const candidate = {
    name: "Real Rival",
    website_url: "https://rival.example",
    relationship: "direct",
    threat_horizon: "now",
    why_competitor: "Targets the same teams with a substitutable workflow.",
    why_now: "Launched a relevant product this month.",
    confidence: 94,
    components: {
      customer_overlap: 90,
      product_substitutability: 90,
      momentum: 80,
      distribution_overlap: 70,
      evidence_quality: 60,
    },
    evidence: [
      {
        source_url: "https://news.example/report",
        title: "Launch report",
        source_type: "news",
        claim: "The company launched a new product.",
        excerpt: "A short paraphrase of the reported launch.",
        published_at: "2026-07-01T00:00:00Z",
        observed_at: "2026-07-29T00:00:00Z",
      },
    ],
  };

  test("rejects candidates whose evidence is not in the source catalog", () => {
    const allowed = new Map([
      ["https://different.example/", { title: "Different source" }],
    ]);
    expect(normalizeResearchCandidates([candidate], allowed)).toEqual([]);
  });

  test("caps confidence below 70 with only one source domain", () => {
    const allowed = new Map([
      ["https://news.example/report", { title: "Launch report" }],
    ]);
    const [normalized] = normalizeResearchCandidates([candidate], allowed);
    expect(normalized?.confidence).toBe(69);
    expect(normalized?.threat_score).toBe(82);
    expect(normalized?.evidence[0]?.content_hash).toHaveLength(64);
  });

  test("allows high confidence only with two distinct evidence domains", () => {
    const secondEvidence = {
      ...candidate.evidence[0],
      source_url: "https://official.example/launch",
      title: "Official launch",
      source_type: "official",
    };
    const allowed = new Map([
      ["https://news.example/report", { title: "Launch report" }],
      ["https://official.example/launch", { title: "Official launch" }],
    ]);
    const [normalized] = normalizeResearchCandidates(
      [{ ...candidate, evidence: [...candidate.evidence, secondEvidence] }],
      allowed,
      new Date("2026-07-29T00:00:00Z"),
    );
    expect(normalized?.confidence).toBe(94);
  });

  test("rejects stale evidence for a now horizon without padding", () => {
    const stale = {
      ...candidate,
      evidence: [
        {
          ...candidate.evidence[0],
          published_at: "2026-01-01T00:00:00Z",
        },
      ],
    };
    const allowed = new Map([
      ["https://news.example/report", { title: "Launch report" }],
    ]);
    expect(
      normalizeResearchCandidates(
        [stale],
        allowed,
        new Date("2026-07-29T00:00:00Z"),
      ),
    ).toEqual([]);
  });

  test("deduplicates a repeated evidence URL and claim", () => {
    const allowed = new Map([
      ["https://news.example/report", { title: "Launch report" }],
    ]);
    const [normalized] = normalizeResearchCandidates(
      [{ ...candidate, evidence: [candidate.evidence[0], candidate.evidence[0]] }],
      allowed,
      new Date("2026-07-29T00:00:00Z"),
    );
    expect(normalized?.evidence).toHaveLength(1);
  });

  test("rejects private-network evidence URLs", () => {
    expect(normalizeHttpUrl("http://127.0.0.1/admin")).toBe(null);
    expect(normalizeHttpUrl("http://192.168.1.5/report")).toBe(null);
    expect(normalizeHttpUrl("https://[2606:4700:4700::1111]/report")).toBe(
      null,
    );
    expect(normalizeHttpUrl("https://public.example/report")).toBe(
      "https://public.example/report",
    );
  });
});

describe("sourced signals", () => {
  const signal = {
    tracked_competitor_id: "33333333-3333-4333-8333-333333333333",
    move_type: "product_launch",
    title: "New product",
    description: "The competitor launched a relevant product.",
    risk_level: "high",
    source_url: "https://news.example/signal",
    source_title: "Ignored model title",
    signal_date: "2026-07-20T00:00:00Z",
    observed_at: "2026-07-29T00:00:00Z",
    confidence: 88,
  };
  const sources = new Map([
    ["https://news.example/signal", { title: "Verified source title" }],
  ]);

  test("maps signals to the provider source catalog", () => {
    expect(
      normalizeSignal(signal, sources, new Date("2026-07-29T00:00:00Z"))
        ?.source_title,
    ).toBe("Verified source title");
    expect(
      normalizeSignal(
        { ...signal, source_url: "https://invented.example/signal" },
        sources,
        new Date("2026-07-29T00:00:00Z"),
      ),
    ).toBe(null);
  });

  test("rejects signals older than 90 days or missing a date", () => {
    expect(
      normalizeSignal(
        { ...signal, signal_date: "2026-01-01T00:00:00Z" },
        sources,
        new Date("2026-07-29T00:00:00Z"),
      ),
    ).toBe(null);
    expect(
      normalizeSignal(
        { ...signal, signal_date: null },
        sources,
        new Date("2026-07-29T00:00:00Z"),
      ),
    ).toBe(null);
  });
});

describe("daily scheduling", () => {
  test("schedules by local wall time across daylight saving changes", () => {
    const afterSpringChange = new Date("2026-03-08T14:00:00.000Z");
    expect(
      nextDailyRun(
        "America/Los_Angeles",
        "08:00",
        afterSpringChange,
      ).toISOString(),
    ).toBe("2026-03-08T15:00:00.000Z");
  });
});

describe("retention scheduling", () => {
  test("runs on the first tick at or after 08:00 UTC, once per day", () => {
    expect(retentionDue(new Date("2026-05-01T07:59:00.000Z"), null)).toBe(false);
    expect(retentionDue(new Date("2026-05-01T08:00:00.000Z"), null)).toBe(true);
    // A missed 08:00 tick still runs on a later tick the same day.
    expect(retentionDue(new Date("2026-05-01T08:07:00.000Z"), null)).toBe(true);
    expect(retentionDue(new Date("2026-05-01T23:59:00.000Z"), "2026-04-30")).toBe(true);
    expect(retentionDue(new Date("2026-05-01T08:01:00.000Z"), "2026-05-01")).toBe(false);
    expect(retentionDue(new Date("2026-05-02T08:00:00.000Z"), "2026-05-01")).toBe(true);
  });
});

describe("job contracts", () => {
  test("rejects messages without the versioned minimal business snapshot", () => {
    expect(isCompetitorResearchJob({ version: 1, run_id: "run" })).toBe(false);
  });

  test("accepts only UUID identifiers", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-run-id")).toBe(false);
  });
});
