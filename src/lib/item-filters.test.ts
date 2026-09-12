import { describe, it, expect } from "vitest";
import {
  parseItemFilters,
  parsePage,
  pageHref,
  removeFilterHref,
} from "./item-filters";

describe("parseItemFilters", () => {
  it("returns empty filters for empty params", () => {
    expect(parseItemFilters({})).toEqual({});
  });

  it("trims and keeps a keyword", () => {
    expect(parseItemFilters({ q: "  mirror  " })).toEqual({ q: "mirror" });
  });

  it("drops a whitespace-only keyword", () => {
    expect(parseItemFilters({ q: "   " })).toEqual({});
  });

  it("accepts valid status and location", () => {
    const f = parseItemFilters({ status: "sold", location: "centre_b" });
    expect(f.status).toBe("sold");
    expect(f.location).toBe("centre_b");
  });

  it("ignores invalid status and location values", () => {
    const f = parseItemFilters({ status: "pending", location: "centre_z" });
    expect(f.status).toBeUndefined();
    expect(f.location).toBeUndefined();
  });

  it("converts price bounds from pounds to pennies", () => {
    const f = parseItemFilters({ minPrice: "10", maxPrice: "99.99" });
    expect(f.minPence).toBe(1000);
    expect(f.maxPence).toBe(9999);
  });

  it("ignores a negative price bound", () => {
    const f = parseItemFilters({ minPrice: "-5" });
    expect(f.minPence).toBeUndefined();
  });

  it("sets the 'to' date to end-of-day", () => {
    const f = parseItemFilters({ to: "2026-06-15" });
    expect(f.to?.getHours()).toBe(23);
    expect(f.to?.getMinutes()).toBe(59);
  });

  it("ignores an unparseable date", () => {
    const f = parseItemFilters({ from: "not-a-date" });
    expect(f.from).toBeUndefined();
  });
});

describe("parsePage", () => {
  it("defaults to 1 when absent", () => {
    expect(parsePage(undefined)).toBe(1);
  });
  it("parses a valid page", () => {
    expect(parsePage("3")).toBe(3);
  });
  it("clamps below 1 to 1", () => {
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
  });
  it("falls back to 1 on junk", () => {
    expect(parsePage("abc")).toBe(1);
  });
  it("floors a fractional page", () => {
    expect(parsePage("2.9")).toBe(2);
  });
});

describe("pageHref", () => {
  it("returns the bare path for page 1 with no filters", () => {
    expect(pageHref({}, 1)).toBe("/inventory");
  });
  it("omits page=1 but keeps filters", () => {
    expect(pageHref({ q: "mirror" }, 1)).toBe("/inventory?q=mirror");
  });
  it("includes page for page > 1", () => {
    expect(pageHref({ status: "sold" }, 2)).toBe("/inventory?status=sold&page=2");
  });
  it("preserves all active filters", () => {
    const href = pageHref({ q: "oak", status: "for_sale", minPrice: "10" }, 3);
    expect(href).toContain("q=oak");
    expect(href).toContain("status=for_sale");
    expect(href).toContain("minPrice=10");
    expect(href).toContain("page=3");
  });
});

describe("removeFilterHref", () => {
  it("removes one filter and keeps the rest", () => {
    const href = removeFilterHref({ q: "oak", status: "sold" }, "status");
    expect(href).toBe("/inventory?q=oak");
  });
  it("returns the bare path when removing the only filter", () => {
    expect(removeFilterHref({ status: "sold" }, "status")).toBe("/inventory");
  });
  it("drops the page when a filter is removed", () => {
    // page isn't part of filterParams, so it should never appear here.
    const href = removeFilterHref({ q: "oak", page: "4" }, "q");
    expect(href).toBe("/inventory");
  });
});
