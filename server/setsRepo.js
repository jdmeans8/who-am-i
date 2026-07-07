// Data access for user-created sets (Supabase). All writes use the server's
// secret-key client. Built-in sets (Classic) are handled in sets.js; this module
// merges them in where relevant so the rest of the app sees one unified concept.

import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase.js";
import { getSetById as getBuiltInSet, listBuiltInSets, CLASSIC_SET } from "./sets.js";

const BUCKET = "character-images";
const REPORT_THRESHOLD = 3; // distinct reporters that auto-hide a set
const UPLOAD_QUOTA = 200; // images a single user may store

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function assertOwner(sb, setId, userId) {
  const { data, error } = await sb.from("sets").select("creator_id").eq("id", setId).single();
  if (error || !data) throw httpError("Set not found.", 404);
  if (data.creator_id !== userId) throw httpError("You don't own this set.", 403);
}

function publicUrl(sb, path) {
  if (!path) return null;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Resolve a set for gameplay: returns { id, title, items:[{name,aliases,image}] }
// or null if not found / not playable. Works for built-in and DB sets.
export async function resolveSet(setId) {
  if (!setId) return CLASSIC_SET;
  const builtIn = getBuiltInSet(setId);
  if (builtIn) return builtIn;

  const sb = getSupabase();
  if (!sb) return null;

  const { data: set, error } = await sb.from("sets").select("*").eq("id", setId).single();
  if (error || !set || set.status !== "active") return null;

  const { data: items } = await sb
    .from("set_items")
    .select("*")
    .eq("set_id", setId)
    .order("position", { ascending: true });

  return {
    id: set.id,
    title: set.title,
    items: (items || []).map((it) => ({
      name: it.name,
      aliases: it.aliases || [],
      image: publicUrl(sb, it.image_path),
    })),
  };
}

// Browse listing: built-in sets first, then public user sets.
export async function listSets({ sort = "popular", q = "", limit = 60 } = {}) {
  const builtIns = listBuiltInSets().map((s) => ({
    id: s.id,
    title: s.title,
    description: "The original pop-culture line-up.",
    creator_name: "Built-in",
    cover_image: null,
    play_count: null,
    like_count: null,
    item_count: s.count,
    builtIn: true,
  }));

  const sb = getSupabase();
  if (!sb) return builtIns;

  let query = sb
    .from("sets")
    .select("id,title,description,creator_name,cover_image,play_count,like_count,item_count,created_at")
    .eq("is_public", true)
    .eq("status", "active");
  if (q) query = query.ilike("title", `%${q}%`);
  query =
    sort === "recent"
      ? query.order("created_at", { ascending: false })
      : query.order("play_count", { ascending: false }).order("like_count", { ascending: false });

  const { data, error } = await query.limit(limit);
  if (error) {
    console.error("listSets:", error.message);
    return builtIns;
  }
  const userSets = (data || []).map((s) => ({ ...s, cover_image: publicUrl(sb, s.cover_image), builtIn: false }));
  return q ? userSets : [...builtIns, ...userSets];
}

// Full detail incl. items — used for set preview pages.
export async function getSetDetail(setId) {
  const builtIn = getBuiltInSet(setId);
  if (builtIn) {
    return {
      id: builtIn.id,
      title: builtIn.title,
      builtIn: true,
      item_count: builtIn.items.length,
      items: builtIn.items.map((it) => ({ name: it.name, image: null })),
    };
  }
  const sb = getSupabase();
  if (!sb) return null;
  const { data: set, error } = await sb.from("sets").select("*").eq("id", setId).single();
  if (error || !set) return null;
  const { data: items } = await sb.from("set_items").select("*").eq("set_id", setId).order("position");
  return {
    id: set.id,
    title: set.title,
    description: set.description,
    creator_name: set.creator_name,
    is_public: set.is_public,
    creator_id: set.creator_id,
    item_count: set.item_count,
    play_count: set.play_count,
    like_count: set.like_count,
    items: (items || []).map((it) => ({
      id: it.id,
      name: it.name,
      aliases: it.aliases || [],
      image: publicUrl(sb, it.image_path),
      image_path: it.image_path,
    })),
  };
}

// Create a set with its items. `items`: [{ name, aliases?, image_path? }].
export async function createSetWithItems({
  title,
  description = null,
  isPublic = false,
  creatorId = null,
  creatorName = null,
  items = [],
}) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");

  const { data: set, error } = await sb
    .from("sets")
    .insert({
      title,
      description,
      is_public: isPublic,
      creator_id: creatorId,
      creator_name: creatorName,
      item_count: items.length,
      cover_image: items.find((it) => it.image_path)?.image_path || null,
    })
    .select()
    .single();
  if (error) throw error;

  if (items.length) {
    const rows = items.map((it, i) => ({
      set_id: set.id,
      name: it.name,
      aliases: it.aliases || [],
      image_path: it.image_path || null,
      position: i,
    }));
    const { error: itemsErr } = await sb.from("set_items").insert(rows);
    if (itemsErr) {
      await sb.from("sets").delete().eq("id", set.id); // roll back the orphaned set
      throw itemsErr;
    }
  }
  return set.id;
}

// Clone an existing set (built-in or public) into a new private set owned by
// `userId`, so they can tweak it. Item image_paths are referenced as-is (they
// live in the original owner's folder but the bucket is public).
export async function remixSet(setId, userId, userName) {
  const detail = await getSetDetail(setId);
  if (!detail) throw httpError("That set couldn't be found.", 404);
  const items = (detail.items || []).map((it) => ({
    name: it.name,
    aliases: it.aliases || [],
    image_path: it.image_path || null,
  }));
  if (items.length < 2) throw httpError("That set has too few characters to remix.", 400);
  return createSetWithItems({
    title: `${detail.title} (remix)`.slice(0, 60),
    description: detail.description || null,
    isPublic: false,
    creatorId: userId,
    creatorName: userName,
    items,
  });
}

export async function deleteSet(setId, userId = null) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");
  if (userId) await assertOwner(sb, setId, userId);
  const { error } = await sb.from("sets").delete().eq("id", setId); // cascades to items
  if (error) throw error;
}

// Replace a set's metadata and items (client sends the full current item list).
export async function updateSetWithItems({ setId, userId, title, description, isPublic, items }) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");
  await assertOwner(sb, setId, userId);

  const patch = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (isPublic !== undefined) patch.is_public = isPublic;
  if (items) {
    patch.item_count = items.length;
    patch.cover_image = items.find((it) => it.image_path)?.image_path || null;
  }
  const { error } = await sb.from("sets").update(patch).eq("id", setId);
  if (error) throw error;

  if (items) {
    await sb.from("set_items").delete().eq("set_id", setId);
    if (items.length) {
      const rows = items.map((it, i) => ({
        set_id: setId,
        name: it.name,
        aliases: it.aliases || [],
        image_path: it.image_path || null,
        position: i,
      }));
      const { error: itemsErr } = await sb.from("set_items").insert(rows);
      if (itemsErr) throw itemsErr;
    }
  }
}

export async function listMySets(userId) {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("sets")
    .select("id,title,description,is_public,item_count,play_count,like_count,cover_image,created_at")
    .eq("creator_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listMySets:", error.message);
    return [];
  }
  return data.map((s) => ({ ...s, cover_image: publicUrl(sb, s.cover_image) }));
}

export async function toggleLike(setId, userId) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");
  const { data: existing } = await sb
    .from("likes")
    .select("set_id")
    .eq("set_id", setId)
    .eq("user_id", userId)
    .maybeSingle();

  let liked;
  if (existing) {
    await sb.from("likes").delete().eq("set_id", setId).eq("user_id", userId);
    liked = false;
  } else {
    const { error } = await sb.from("likes").insert({ set_id: setId, user_id: userId });
    if (error) throw error;
    liked = true;
  }
  const { count } = await sb.from("likes").select("*", { count: "exact", head: true }).eq("set_id", setId);
  await sb.from("sets").update({ like_count: count || 0 }).eq("id", setId);
  return { liked, likeCount: count || 0 };
}

export async function reportSet(setId, userId, reason) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");
  const { error } = await sb.from("reports").insert({
    set_id: setId,
    reporter_id: userId,
    reason: reason ? String(reason).slice(0, 500) : null,
  });
  if (error) throw error;

  // Auto-hide once enough *distinct* users have flagged it (one user spamming
  // reports can't take a set down alone). Only touch currently-active sets.
  const { data: rows } = await sb.from("reports").select("reporter_id").eq("set_id", setId);
  const distinct = new Set((rows || []).map((r) => r.reporter_id).filter(Boolean));
  if (distinct.size >= REPORT_THRESHOLD) {
    await sb.from("sets").update({ status: "hidden" }).eq("id", setId).eq("status", "active");
  }
}

// Upload a processed (webp) image buffer to storage under the user's folder.
export async function uploadImageBuffer(userId, webpBuffer) {
  const sb = getSupabase();
  if (!sb) throw new Error("Set storage is not configured.");

  // Per-user image cap (abuse / cost guard). Best-effort: if the count can't be
  // read we let the upload through rather than block on a transient error.
  const { data: existing, error: listErr } = await sb.storage
    .from(BUCKET)
    .list(userId, { limit: UPLOAD_QUOTA + 1 });
  if (!listErr && existing && existing.length >= UPLOAD_QUOTA) {
    throw httpError(`You've reached the ${UPLOAD_QUOTA}-image upload limit. Delete some to add more.`, 403);
  }

  const path = `${userId}/${randomUUID()}.webp`;
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, webpBuffer, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return { path, url: publicUrl(sb, path) };
}

// Best-effort, non-atomic play-count bump (fine for a popularity signal).
export async function incrementPlayCount(setId) {
  const sb = getSupabase();
  if (!sb || getBuiltInSet(setId)) return;
  try {
    const { data } = await sb.from("sets").select("play_count").eq("id", setId).single();
    if (data) await sb.from("sets").update({ play_count: (data.play_count || 0) + 1 }).eq("id", setId);
  } catch (e) {
    console.error("incrementPlayCount:", e.message);
  }
}
