// A "set" is a named collection of characters used for a game. The built-in
// Classic set is derived from the curated pool. Later, user-created sets will
// come from the database with the same shape:
//   { id, title, items: [{ name, aliases: string[], image: string|null }] }
// `image` is null for the built-in set (the client renders a generated avatar);
// user sets will carry a URL to an uploaded image.

import { CHARACTERS } from "./characters.js";

export const CLASSIC_SET = {
  id: "classic",
  title: "Classic Pop Culture",
  items: CHARACTERS.map((c) => ({
    name: c.name,
    aliases: c.aliases || [],
    image: null,
  })),
};

const BUILT_IN = new Map([[CLASSIC_SET.id, CLASSIC_SET]]);

// Resolve a set by id. For now only built-ins exist; a later phase will fall
// back to a database lookup for user-created sets.
export function getSetById(id) {
  if (!id) return CLASSIC_SET;
  return BUILT_IN.get(id) || null;
}

export function listBuiltInSets() {
  return [...BUILT_IN.values()].map((s) => ({
    id: s.id,
    title: s.title,
    count: s.items.length,
  }));
}
