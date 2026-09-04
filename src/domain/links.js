/**
 * Pointers to material that lives somewhere else.
 *
 * ## Why a pointer and not a copy
 *
 * The app refuses stored copies of things it can derive - a brief is returned
 * and thrown away because it is a second copy of facts the store already holds,
 * going stale from the moment it is written. A link is not that. It is the same
 * shape as `lastWrote`, which carries a Nib note's id and title and nothing
 * else: Nib owns the note, Tend points at it.
 *
 * What earns a link is material the app cannot derive and would not want to
 * hold. Prepared words for a conversation, a reading of one that happened, a
 * spec somebody else maintains.
 *
 * ## The staleness this has to handle
 *
 * A Nib note about a conversation stays true for ever. A prepared reading does
 * not: once the conversation happens it is either acted on or history, and a
 * link sitting on somebody's page with no date reads as current advice a year
 * after it stopped being any such thing.
 *
 * So a link carries when it was made and the page shows the age. That is the
 * whole mechanism, and it is the same one `lastWrote` uses. Nothing here
 * expires a link automatically: deciding a reading is spent is a judgement, and
 * a page that quietly hid material would be worse than one showing something
 * plainly marked as six months old.
 *
 * ## Why the scheme is checked
 *
 * These open through Electron's `shell.openExternal`, which hands the URL to
 * whatever the operating system has registered for its scheme. That makes an
 * unchecked URL in a data field a way to launch arbitrary handlers, and the
 * field is writable over the agent surface. So the check is not tidiness:
 * `http` and `https` only, and everything else is refused at the write.
 */

/** The only schemes a stored link may use. See the header. */
const ALLOWED = ["http:", "https:"];

/**
 * A usable web address, or why it is not one.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, url: string } | { ok: false, why: string }}
 */
export function webAddress(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") {
    return { ok: false, why: "A link needs an address." };
  }

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return {
      ok: false,
      why: `"${text}" är inte en webbadress. Den måste börja med https:// eller http://.`
    };
  }

  if (!ALLOWED.includes(parsed.protocol)) {
    return {
      ok: false,
      why:
        `Länkar öppnas i webbläsaren genom operativsystemet, så bara https:// och http:// ` +
        `är tillåtna. "${parsed.protocol}" skulle lämna adressen till vilket program som än ` +
        `gör anspråk på det schemat.`
    };
  }

  return { ok: true, url: parsed.toString() };
}

/**
 * What to call a link when nothing was typed.
 *
 * The host rather than the whole address. A row reading
 * "claude.ai" is scannable; one reading the full path with a uuid in it is a
 * wall of characters that pushes everything else off the line.
 *
 * @param {string} url An address that has already passed `webAddress`.
 * @returns {string}
 */
export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
