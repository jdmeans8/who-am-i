import React from "react";

// Static Terms of Service / Privacy Policy. This is plain-language boilerplate
// for a small hobby party game — review and adjust for your own launch.
export default function Legal({ kind, onBack }) {
  const updated = "July 2026";
  return (
    <div className="screen legal">
      <header className="page-head">
        <button className="btn btn-ghost small" onClick={onBack}>
          ← Back
        </button>
        <h1>{kind === "privacy" ? "Privacy Policy" : "Terms of Service"}</h1>
      </header>
      <div className="card legal-body">
        <p className="muted small">Last updated: {updated}</p>
        {kind === "privacy" ? <Privacy /> : <Terms />}
      </div>
    </div>
  );
}

function Terms() {
  return (
    <>
      <p>
        Welcome to Who Am I?, a free multiplayer party guessing game. By creating a room, joining a
        game, or making an account, you agree to these terms.
      </p>

      <h3>Your account</h3>
      <p>
        You can sign in with Google or an email magic link. You’re responsible for activity under your
        account. Don’t impersonate others or share your sign-in link.
      </p>

      <h3>Content you create</h3>
      <p>
        You can build character sets and upload or import images. You’re responsible for what you add,
        and you confirm you have the right to use it. Don’t upload content that is illegal, hateful,
        harassing, sexually explicit, or that infringes someone else’s rights.
      </p>
      <p>
        You keep ownership of what you create. By making a set public, you grant other players the
        ability to view, play, and remix it within the game.
      </p>

      <h3>Moderation</h3>
      <p>
        Any player can report a set. Sets that receive multiple reports are automatically hidden
        pending review, and we may remove content or accounts that break these terms at any time.
      </p>

      <h3>No warranty</h3>
      <p>
        The game is provided “as is,” without warranties of any kind. It may be unavailable, lose data,
        or change at any time. To the extent allowed by law, we aren’t liable for damages arising from
        your use of the game.
      </p>

      <h3>Contact</h3>
      <p>
        Questions? Email <a href="mailto:jasondmeans7@gmail.com">jasondmeans7@gmail.com</a>.
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p>
        This policy explains what Who Am I? collects and why. The short version: we collect the minimum
        needed to run the game, and we don’t sell your data.
      </p>

      <h3>What we store</h3>
      <ul>
        <li>
          <strong>Account:</strong> your email address and display name, via Google or email sign-in.
        </li>
        <li>
          <strong>Content:</strong> character sets you create and images you upload or import.
        </li>
        <li>
          <strong>Activity:</strong> basic gameplay signals like a set’s play and like counts.
        </li>
      </ul>
      <p>
        Live game state (room codes, turns, who’s playing) is kept in server memory only for the
        duration of a game and isn’t stored long-term. Your private in-game notepad never leaves your
        own device.
      </p>

      <h3>Service providers</h3>
      <p>
        We use Supabase for authentication, database, and image storage. Image search results come from
        Wikipedia and Giphy; when you search, your query is sent to those services. Images you import
        are copied into our own storage.
      </p>

      <h3>Your choices</h3>
      <p>
        You can delete your sets at any time. To delete your account and associated data, email{" "}
        <a href="mailto:jasondmeans7@gmail.com">jasondmeans7@gmail.com</a>.
      </p>

      <h3>Children</h3>
      <p>The game isn’t directed at children under 13, and we don’t knowingly collect their data.</p>
    </>
  );
}
