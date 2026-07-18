# GameHub — Missing Pages Design Spec

Source of truth: claude.ai/design project **"GameHub frontend product spec"**
(`af08bf8d-af72-4257-9557-1c9d0454e7a5`), files `GameHub Prototype.dc.html`,
`GameHub Wireframes.dc.html`, `uploads/gamehub-frontend-product-spec.md`.

This document lists what the interactive prototype already covers, what is
**not designed yet**, and gives a ready-to-paste prompt per missing page so the
designs can be generated in the same Claude Design project and stay consistent
with the existing prototype.

---

## 1. What the prototype already designs

Four pages, each with Desktop and Mobile variants driven by a viewport toggle,
plus a Guest/Account identity toggle:

| Page | Coverage |
|---|---|
| **Home** | Hero (Play Now / View Details), Hot Games, Continue Playing (conditional), New & Updated, Category chips; header search with suggestions + recent searches; mobile search overlay; mobile bottom tab bar |
| **Browse** | Filter sidebar (category / orientation / input / offline), sort menu, removable filter chips, result count, Load More, "no games match" empty state; mobile filter bottom sheet; Favorites reached as a browse mode (`favoritesOnly`) |
| **Game Detail** | Media carousel (banner / screenshots / trailer), metadata, rating stars (guest-blocked with toast), favorite, share (Link copied toast), controls list, leaderboard preview with Today / All-Time tabs, suggested games |
| **Player** | Rotate-device prompt, loading progress, in-game shell (mute / fullscreen / restart), collapsible desktop side panel, mobile bottom sheet, game-over overlay (score, best, rank, NEW RECORD), guest-name prompt, Play Again |

Global: toast system with Undo action, accent-color theming (`--accent`,
default `#6D5AE6`), reduced-motion and compact-cards props.

The wireframes file only explores structural options for these same three
areas (Home, Browse/Search, Player) — it adds no extra pages.

---

## 2. Pages / surfaces NOT designed yet

Ordered by the product spec's implementation priority (§31).

| # | Missing surface | Spec § | Priority | Notes |
|---|---|---|---|---|
| 1 | **Authentication** (login, create account, continue as guest) | 17 | P0 | Nothing exists; prototype only toggles identity via prototype controls |
| 2 | **Error & system pages** (404, game removed, no internet, server failure, access denied) | 21–22 | P0 | Only browse has an empty state |
| 3 | **Loading skeletons + empty-state set** (card, section, detail, leaderboard row, comment, profile header; no favorites / no scores / empty leaderboard / no comments) | 22 | P0 | Prototype loads data instantly, no skeletons designed |
| 4 | **Comments section** on Game Detail (list, composer, guest naming, report, moderation states) | 14 | P1 | Entirely absent from the detail page |
| 5 | **Profile — account** (overview, scores, favorites, comments tabs) | 18.1–18.2 | P1 | Prototype literally toasts "Profile isn't part of this prototype" |
| 6 | **Guest menu** (change name, clear local data warning, upgrade to account) | 18.3 | P1 | Absent |
| 7 | **Settings** (language, theme, mute, autoplay, reduced motion, privacy, logout, delete account, clear guest data) | 19 | P1 | Absent; header also lacks the language selector from §6.1 |
| 8 | **Dedicated Favorites page** | 15 | P1 | Partial: exists only as a browse filter; missing its own empty state, remove-favorite affordance, in-favorites sort/search |
| 9 | **Recently Played / My Scores history** | 16 | P1 | Partial: home "Continue Playing" rail only; no history view with last-played time, best score, Play Again |
| 10 | **External link warning** (modal / bottom sheet) | 20 | P1 | Absent |
| 11 | **Player offline state + Report Game flow** | 12.2, 12.5 | P1 | Detail shows an offline-support label, but no offline player UI and no report flow |
| 12 | **Admin & Developer Studio screens** | 5 | P2 | Permission-gated nav; the repo (`apps/web`) already has functional pages but no designs — confirm whether these are in design scope |

---

## 3. Shared design language (include in every prompt)

Paste this block into each generation prompt so new pages match the prototype:

```text
Match the existing GameHub Prototype design language exactly:
- Canvas #eeece4, surfaces #fff, borders 1.5px solid #e6e2d7, ink #211f1c,
  muted text #79746a / #8a8578.
- Accent is var(--accent), default #6D5AE6 (alternates #E8562C, #12897A,
  #D6406B) — used for primary buttons, active nav, selected chips, "you"
  leaderboard highlight (color-mix(in oklch, var(--accent) 15%, white)).
- Fonts: 'Fredoka' (600–700) for headings/titles, 'Manrope' for body/UI.
- Radii: 10–12px buttons and inputs, 12–16px cards and sheets; pill chips
  (999px, 1.5px border).
- Game art placeholders: linear-gradient(135deg, oklch(0.94 0.045 H),
  oklch(0.8 0.11 H+35)).
- Toasts: fixed bottom-center, #211f1c background, white text, optional
  accent-colored action button.
- Shell: max-width 1180px; desktop header = logo, Home/Browse/Favorites nav,
  search bar, identity; mobile = compact top bar + bottom tab bar
  (Home, Browse, Search, Favs, Profile).
- Transitions .18s ease, disabled when reduced motion is on.
- Provide BOTH Desktop and Mobile variants, wired to the existing
  viewport toggle, and respect the Guest/Account identity toggle.
```

---

## 4. Generation prompts per missing surface

### 4.1 Authentication (P0)

> Add an **Authentication flow** to the GameHub Prototype. Desktop: a centered
> modal over a dimmed current page. Mobile: a full-screen sheet.
> Content: "Continue with Google", "Continue with Facebook", "Continue with
> Apple", divider, email + password fields with "Log in", links to "Create
> Account" and "Continue as Guest". Create Account variant: display name,
> email, password, confirm.
> Guest path: explain that guests have no full profile, guest scores stay
> public, and guest data is NOT transferred to an account.
> Error states to design: wrong password (inline), email already registered
> (inline with "Log in instead"), OAuth cancelled (dismissable banner),
> suspended account (blocking message), network failure (retry).
> Entry points: header "Login" button (logged-out desktop), Profile tab
> (mobile), and the guest-name prompt's "Create account instead" link.
> Successful auth returns to the page the user came from.

### 4.2 Error & system pages (P0)

> Add **full-page error states** to the GameHub Prototype, each with the
> standard header/tab-bar shell, a lightweight illustration, a short
> explanation, and one clear CTA:
> 1. 404 — "This page doesn't exist" → Back to Home.
> 2. Game removed/unavailable — → Browse similar games.
> 3. No internet — → Retry; note which games support offline play.
> 4. Server failure — → Retry / status hint.
> 5. Access denied — → Back to Home (used for gated admin/studio routes).
> Keep them friendly and lightly playful, not enterprise-sterile.

### 4.3 Skeletons & empty states (P0)

> Add a **loading & empty-state kit** to the GameHub Prototype:
> Skeletons (shimmer, layout-shift-free): game card, homepage rail, game
> detail top section, leaderboard row, comment item, profile header.
> Empty states (visual + one line + CTA): no favorites ("Browse games"),
> no recently played ("Find a game"), no comments ("Be the first to
> comment"), no search results ("Clear filters"), no scores ("Play your
> first game"), empty leaderboard ("Set the first score").

### 4.4 Comments on Game Detail (P1)

> Extend the GameHub Prototype **Game Detail page with a Comments section**
> (below Leaderboard). Comment item: avatar or guest icon, display name with
> optional Guest badge, timestamp, body, Edited indicator, Reply, Report,
> and a More menu (bottom sheet on mobile). One level of nesting max.
> Composer: text area + Submit; guests without a name get the existing
> guest-name prompt first; keyboard must never cover Submit on mobile.
> Moderation states to show: normal, pending review, hidden, removed, locked
> thread. Include the comment skeleton and "no comments" empty state.
> Posting shows the standard "Comment posted" toast.

### 4.5 Profile — account (P1)

> Add an **account Profile page** to the GameHub Prototype. Header: avatar,
> display name, join date, stat tiles (favorites, games played, best scores).
> Desktop: sidebar or tab layout with Overview / Scores / Favorites /
> Comments / Settings. Mobile: compact header, small stat cards, scrollable
> tabs; settings is a separate page.
> Overview: recent activity list. Scores: per-game best-score rows with rank
> and date. Favorites: game grid reusing the existing card. Comments: the
> user's comments with links to their games.
> Reached from the header avatar dropdown (Profile, My Scores, Recently
> Played, Favorites, Settings, Logout) and the mobile Profile tab.

### 4.6 Guest menu (P1)

> Add a **Guest menu** to the GameHub Prototype, opened from the profile
> slot while in guest identity. Desktop: dropdown; mobile: bottom sheet.
> Content: current guest name with "Change display name" inline edit,
> Favorites, Recently Played, prominent "Log in or Create Account" CTA,
> Language, Theme, and "Clear local data" — which opens a confirm dialog
> warning that previous scores and favorites will no longer be recognized
> as theirs.

### 4.7 Settings (P1)

> Add a **Settings page** to the GameHub Prototype (destination from profile
> menu / mobile profile tab). Grouped rows:
> Preferences — language (EN/VI), theme, mute by default, audio autoplay,
> reduced motion. Privacy — privacy controls. Account — logout, delete
> account (destructive confirm). Guest variant swaps the Account group for
> "Clear guest data". Saving shows the "Settings saved" toast.
> Also add the **language selector to the desktop header** per spec §6.1.

### 4.8 Dedicated Favorites page (P1)

> Promote Favorites in the GameHub Prototype from a browse filter to a
> **dedicated Favorites page**: game grid with per-card "Remove favorite"
> (with Undo toast), sort, search-within-favorites, and the no-favorites
> empty state. Keep the existing nav entry pointing here.

### 4.9 Recently Played & My Scores (P1)

> Add **Recently Played and My Scores views** to the GameHub Prototype
> (sections of Profile, or standalone pages reachable from the profile
> menu). Recently Played card: thumbnail, title, last-played time, best
> score, Play Again button. Guests see Recently Played only; accounts also
> get My Scores: game rows with best score, rank, achieved date.
> Include their empty states.

### 4.10 External link warning (P1)

> Add the **external link warning** to the GameHub Prototype player: when a
> game requests navigation, show the destination site name and domain, a
> "You are leaving GameHub" warning, and Cancel (default) / Continue
> actions. Desktop: modal over the dimmed game. Mobile: bottom sheet.
> Games must never redirect directly.

### 4.11 Player offline state & Report Game (P1)

> Extend the GameHub Prototype **Player page** with:
> 1. Offline state — banner/badge when connection drops: offline-capable
>    games state that high scores and cloud progress won't sync; others get
>    a blocking "reconnect to play" state with Retry.
> 2. Report Game — entry in the side panel / mobile sheet opening a short
>    form (reason select + optional text) with a confirmation toast.
> 3. Slow-load state — after the existing loading stage stalls: Retry,
>    Reload, Report Loading Issue, requirements info.

### 4.12 Admin & Developer Studio (P2 — confirm scope)

> The repo already implements functional Admin and Studio pages
> (`apps/web/src/app/[locale]/admin`, `.../studio`) with no corresponding
> designs. If in scope: design a permission-gated **Studio** (game list,
> upload/new game form with zip upload, build status) and **Admin** (review
> queue, game approval detail) using the same design language, desktop-first
> since these are operator tools.

---

## 5. Suggested generation order

1. Authentication (P0 — blocks login/guest flows everywhere)
2. Skeletons & empty states (P0 — reused by every other page)
3. Error pages (P0)
4. Comments on Game Detail (P1 — biggest visible content gap)
5. Profile + Guest menu (P1)
6. Settings (P1)
7. Favorites page, Recently Played / My Scores (P1)
8. External link warning, Player offline + Report (P1)
9. Admin / Studio (P2, pending scope decision)
