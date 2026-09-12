/**
 * Pure item-form validation — no server imports, no side effects, so it's
 * unit-testable in isolation and reusable by the server actions. Separating
 * the validation rules from the side-effecting action (db writes, image
 * upload) is both cleaner and what makes these rules straightforward to
 * test.
 */

export type ParsedItem = {
  description: string;
  condition: string | null;
  dimensions: string | null;
  pricePence: number;
  costPence: number;
  status: "for_sale" | "sold";
  location: "centre_a" | "centre_b";
  listingUrl: string | null;
};

export type ParseResult =
  | { ok: true; values: ParsedItem }
  | { ok: false; error: string };

/**
 * Validate and normalise the item form fields. Takes a minimal record (so
 * it's testable without constructing a real FormData), returns either the
 * parsed values or a single user-facing error message. Prices arrive as
 * pound strings and are stored as integer pennies.
 */
export function parseItemFields(input: {
  description?: string | null;
  condition?: string | null;
  dimensions?: string | null;
  price?: string | null;
  cost?: string | null;
  status?: string | null;
  location?: string | null;
  listingUrl?: string | null;
}): ParseResult {
  const description = input.description?.trim();
  const condition = input.condition?.trim() || null;
  const dimensions = input.dimensions?.trim() || null;
  const listingUrl = input.listingUrl?.trim() || null;
  const status = input.status ?? "";
  const location = input.location ?? "";

  if (!description) return { ok: false, error: "Description is required." };

  const pounds = Number(input.price);
  if (!input.price || !Number.isFinite(pounds) || pounds < 0)
    return { ok: false, error: "Price must be a non-negative number." };
  const pricePence = Math.round(pounds * 100);

  const cost = Number(input.cost);
  if (!input.cost || !Number.isFinite(cost) || cost < 0)
    return { ok: false, error: "Cost must be a non-negative number." };
  const costPence = Math.round(cost * 100);

  if (status !== "for_sale" && status !== "sold")
    return { ok: false, error: "Please choose a valid status." };
  if (location !== "centre_a" && location !== "centre_b")
    return { ok: false, error: "Please choose a valid location." };

  if (listingUrl) {
    try {
      new URL(listingUrl);
    } catch {
      return { ok: false, error: "Listing URL must be a valid URL (including https://)." };
    }
  }

  return {
    ok: true,
    values: { description, condition, dimensions, pricePence, costPence, status, location, listingUrl },
  };
}
