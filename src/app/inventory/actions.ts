"use server";

import { randomUUID } from "crypto";
import sharp from "sharp";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/auth";
import { db } from "@/db";
import { items } from "@/db/schema";
import { r2, R2_BUCKET } from "@/lib/r2";
import { parseItemFields, type ParseResult } from "@/lib/item-validation";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches serverActions.bodySizeLimit

/**
 * Form state returned to the client. `error` holds a user-facing validation
 * message; the form displays it via useActionState. Validation failures
 * RETURN this (user can fix and resubmit); genuine faults (unauthorised,
 * not-found, infra) still THROW to the error boundary, since they aren't
 * user-fixable. On success the action redirects and nothing is returned.
 */
export type FormState = { error?: string };

/**
 * Thin adapter: pull the raw fields off FormData and delegate to the pure
 * validator (which is unit-tested in isolation).
 */
function parseItemForm(formData: FormData): ParseResult {
  return parseItemFields({
    description: formData.get("description") as string | null,
    condition: formData.get("condition") as string | null,
    dimensions: formData.get("dimensions") as string | null,
    price: formData.get("price") as string | null,
    cost: formData.get("cost") as string | null,
    status: formData.get("status") as string | null,
    location: formData.get("location") as string | null,
    listingUrl: formData.get("listingUrl") as string | null,
  });
}

export async function createItem(prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorised");

  const parsed = parseItemForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;

  const image = formData.get("image") as File | null;
  let imageKey: string | null = null;
  let thumbKey: string | null = null;
  if (image && image.size > 0) {
    if (image.size > MAX_BYTES) return { error: "Image is too large (max 5 MB)." };
    const uploaded = await processAndUploadImage(image);
    imageKey = uploaded.imageKey;
    thumbKey = uploaded.thumbKey;
  }

  await db.insert(items).values({
    description: v.description, condition: v.condition, dimensions: v.dimensions,
    pricePence: v.pricePence, costPence: v.costPence,
    status: v.status, location: v.location, listingUrl: v.listingUrl, imageKey, thumbKey,
  });

  revalidatePath("/inventory");
  redirect("/inventory?saved=added");
}

async function processAndUploadImage(image: File): Promise<{ imageKey: string; thumbKey: string }> {
  if (image.size > MAX_BYTES) throw new Error("Image is too large (max 5 MB)");
  const inputBuffer = Buffer.from(await image.arrayBuffer());
  const [fullBuffer, thumbBuffer] = await Promise.all([
    sharp(inputBuffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    sharp(inputBuffer).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
  ]);
  const id = randomUUID();
  const imageKey = `items/${id}/full.webp`;
  const thumbKey = `items/${id}/thumb.webp`;
  await Promise.all([
    r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: imageKey, Body: fullBuffer, ContentType: "image/webp" })),
    r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: thumbKey, Body: thumbBuffer, ContentType: "image/webp" })),
  ]);
  return { imageKey, thumbKey };
}

async function deleteImageObjects(imageKey: string | null, thumbKey: string | null): Promise<void> {
  const keys = [imageKey, thumbKey].filter((k): k is string => Boolean(k));
  await Promise.all(keys.map((Key) =>
    r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key })).catch((e) => console.error("R2 delete failed for", Key, e))
  ));
}

export async function updateItem(id: number, prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorised");

  const [existing] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!existing) throw new Error("Item not found");

  const parsed = parseItemForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;

  let soldAt = existing.soldAt;
  if (v.status === "sold" && existing.status !== "sold") soldAt = new Date();
  else if (v.status === "for_sale" && existing.status === "sold") soldAt = null;

  const image = formData.get("image") as File | null;
  let imageKey = existing.imageKey;
  let thumbKey = existing.thumbKey;
  if (image && image.size > 0) {
    if (image.size > MAX_BYTES) return { error: "Image is too large (max 5 MB)." };
    const uploaded = await processAndUploadImage(image);
    await deleteImageObjects(existing.imageKey, existing.thumbKey);
    imageKey = uploaded.imageKey;
    thumbKey = uploaded.thumbKey;
  }

  await db.update(items).set({
    description: v.description, condition: v.condition, dimensions: v.dimensions,
    pricePence: v.pricePence, costPence: v.costPence,
    status: v.status, location: v.location, listingUrl: v.listingUrl,
    imageKey, thumbKey, soldAt, updatedAt: new Date(),
  }).where(eq(items.id, id));

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect("/inventory?saved=updated");
}

export async function deleteItem(id: number): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorised");
  const [existing] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!existing) throw new Error("Item not found");
  await db.delete(items).where(eq(items.id, id));
  await deleteImageObjects(existing.imageKey, existing.thumbKey);
  revalidatePath("/inventory");
  redirect("/inventory");
}