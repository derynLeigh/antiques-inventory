import { describe, it, expect } from "vitest";
import { parseItemFields } from "./item-validation";

// A valid baseline; individual tests override one field to isolate a rule.
const valid = {
  description: "Brass mirror",
  price: "195.00",
  cost: "80.00",
  status: "for_sale",
  location: "centre_a",
};

describe("parseItemFields — success", () => {
  it("accepts a fully valid item", () => {
    const r = parseItemFields(valid);
    expect(r.ok).toBe(true);
  });

  it("converts pounds to integer pennies", () => {
    const r = parseItemFields({ ...valid, price: "195.00", cost: "80.50" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.values.pricePence).toBe(19500);
    expect(r.values.costPence).toBe(8050);
  });

  it("rounds fractional pennies to the nearest penny", () => {
    const r = parseItemFields({ ...valid, price: "10.005" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.values.pricePence).toBe(1001); // 10.005 * 100 = 1000.5 → 1001
  });

  it("trims description and nullifies empty optional fields", () => {
    const r = parseItemFields({ ...valid, description: "  Oak chair  ", condition: "   ", listingUrl: "" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.values.description).toBe("Oak chair");
    expect(r.values.condition).toBeNull();
    expect(r.values.listingUrl).toBeNull();
  });

  it("accepts a valid listing URL", () => {
    const r = parseItemFields({ ...valid, listingUrl: "https://example.com/item/3" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.values.listingUrl).toBe("https://example.com/item/3");
  });
});

describe("parseItemFields — validation failures", () => {
  it("rejects a missing description", () => {
    const r = parseItemFields({ ...valid, description: "  " });
    expect(r).toEqual({ ok: false, error: "Description is required." });
  });

  it("rejects a negative price", () => {
    const r = parseItemFields({ ...valid, price: "-5" });
    expect(r).toEqual({ ok: false, error: "Price must be a non-negative number." });
  });

  it("rejects a non-numeric price", () => {
    const r = parseItemFields({ ...valid, price: "abc" });
    expect(r).toEqual({ ok: false, error: "Price must be a non-negative number." });
  });

  it("rejects a missing price", () => {
    const r = parseItemFields({ ...valid, price: "" });
    expect(r).toEqual({ ok: false, error: "Price must be a non-negative number." });
  });

  it("rejects a negative cost", () => {
    const r = parseItemFields({ ...valid, cost: "-1" });
    expect(r).toEqual({ ok: false, error: "Cost must be a non-negative number." });
  });

  it("rejects an invalid status", () => {
    const r = parseItemFields({ ...valid, status: "pending" });
    expect(r).toEqual({ ok: false, error: "Please choose a valid status." });
  });

  it("rejects an invalid location", () => {
    const r = parseItemFields({ ...valid, location: "centre_z" });
    expect(r).toEqual({ ok: false, error: "Please choose a valid location." });
  });

  it("rejects a malformed listing URL", () => {
    const r = parseItemFields({ ...valid, listingUrl: "not a url" });
    expect(r).toEqual({ ok: false, error: "Listing URL must be a valid URL (including https://)." });
  });
});
