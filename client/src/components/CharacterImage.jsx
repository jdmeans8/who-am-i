import React from "react";

// Renders a character's picture. Priority:
//   hidden  → a "?" placeholder (your own secret character)
//   image   → the uploaded picture (user-created sets)
//   neither → a generated initials avatar (built-in Classic set has no images)

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export default function CharacterImage({ name, image, hidden, size = "md" }) {
  const cls = `char-img char-img-${size}`;

  if (hidden) {
    return <div className={`${cls} char-img-hidden`}>❓</div>;
  }
  if (image) {
    return <img className={cls} src={image} alt={name || "character"} loading="lazy" />;
  }
  const hue = hashHue(name || "");
  return (
    <div
      className={`${cls} char-img-avatar`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 40) % 360} 65% 35%))`,
      }}
      aria-label={name}
    >
      {initials(name || "?")}
    </div>
  );
}
