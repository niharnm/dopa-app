"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  normalizeProductInput,
  PRODUCT_SELECT,
  type Product,
  type ProductInput,
} from "@/lib/product-types";
import { isUuid } from "@/lib/validation";
import { databaseFailure } from "@/utils/action-security";

async function requireUser() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" as const, supabase, user: null };
  }

  return { supabase, user, error: null };
}

async function assertBusinessOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  businessId: string,
) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) {
    return databaseFailure(
      "assert_product_business_owner",
      error,
      "The business could not be verified. Try again.",
    );
  }
  if (!data) return { error: "Business not found" };
  return { ok: true as const };
}

function revalidate() {
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
}

export async function listProducts(businessId: string) {
  if (!isUuid(businessId)) {
    return { error: "Invalid business ID", products: [] as Product[] };
  }

  const auth = await requireUser();
  if (auth.error || !auth.user) {
    return {
      error: auth.error ?? "Not authenticated",
      products: [] as Product[],
    };
  }

  const owned = await assertBusinessOwner(auth.supabase, auth.user.id, businessId);
  if ("error" in owned) {
    return { error: owned.error, products: [] as Product[] };
  }

  const { data, error } = await auth.supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    return {
      ...databaseFailure(
        "list_products",
        error,
        "Products could not be loaded. Try again.",
      ),
      products: [] as Product[],
    };
  }
  return { products: (data ?? []) as Product[], error: null };
}

export async function createProduct(businessId: string, input: ProductInput) {
  if (!isUuid(businessId)) return { error: "Invalid business ID" };

  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "Not authenticated" };

  const owned = await assertBusinessOwner(auth.supabase, auth.user.id, businessId);
  if ("error" in owned) return { error: owned.error };

  const normalized = normalizeProductInput(input);
  if ("error" in normalized) return { error: normalized.error };

  const { data, error } = await auth.supabase
    .from("products")
    .insert({
      business_id: businessId,
      ...normalized.data,
      updated_at: new Date().toISOString(),
    })
    .select(PRODUCT_SELECT)
    .single();

  if (error) return databaseFailure("create_product", error);

  revalidate();
  return { success: true, product: data as Product, error: null };
}

export async function updateProduct(productId: string, input: ProductInput) {
  if (!isUuid(productId)) return { error: "Invalid product ID" };

  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "Not authenticated" };

  const { data: existing, error: fetchError } = await auth.supabase
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError) {
    return databaseFailure(
      "load_product_for_update",
      fetchError,
      "The product could not be updated. Try again.",
    );
  }
  if (!existing) return { error: "Product not found" };

  const owned = await assertBusinessOwner(
    auth.supabase,
    auth.user.id,
    existing.business_id,
  );
  if ("error" in owned) return { error: owned.error };

  const normalized = normalizeProductInput(input);
  if ("error" in normalized) return { error: normalized.error };

  const { data, error } = await auth.supabase
    .from("products")
    .update({
      ...normalized.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select(PRODUCT_SELECT)
    .single();

  if (error) return databaseFailure("update_product", error);

  revalidate();
  return { success: true, product: data as Product, error: null };
}

export async function deleteProduct(productId: string) {
  if (!isUuid(productId)) return { error: "Invalid product ID" };

  const auth = await requireUser();
  if (auth.error || !auth.user) return { error: auth.error ?? "Not authenticated" };

  const { data: existing, error: fetchError } = await auth.supabase
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError) {
    return databaseFailure(
      "load_product_for_delete",
      fetchError,
      "The product could not be deleted. Try again.",
    );
  }
  if (!existing) return { error: "Product not found" };

  const owned = await assertBusinessOwner(
    auth.supabase,
    auth.user.id,
    existing.business_id,
  );
  if ("error" in owned) return { error: owned.error };

  const { error } = await auth.supabase.from("products").delete().eq("id", productId);
  if (error) {
    return databaseFailure(
      "delete_product",
      error,
      "The product could not be deleted. Try again.",
    );
  }

  revalidate();
  return { success: true, error: null };
}
