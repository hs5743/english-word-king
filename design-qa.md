# CP27 寶石冒險學院・Design QA

- Source visual truth: `C:\Users\wsyeu\.codex\generated_images\019f4ce6-4569-7da2-b606-e4a41b8fcd65\exec-d2fa2c0a-55ba-4c96-8e3e-0b317e52547f.png`
- Implementation URL: `http://127.0.0.1:3000/index.html`
- Implementation screenshot: `C:\Users\wsyeu\.codex\visualizations\2026\07\10\019f4ce6-4569-7da2-b606-e4a41b8fcd65\cp27-qa\cp27-desktop-1440x900.png`
- Mobile screenshot: `C:\Users\wsyeu\.codex\visualizations\2026\07\10\019f4ce6-4569-7da2-b606-e4a41b8fcd65\cp27-qa\cp27-mobile-390x844.png`
- Viewports: desktop 1440×900; mobile 390×844
- State: logged out, live Supabase data enabled

## Full-view comparison evidence

The source and implementation were opened together in the same comparison pass. The implementation preserves the source's defining composition: dark sapphire navigation, shield-and-crystal brand mark, bright academy campus, monumental crystal at left, academy at right, central competition badge and title, gold primary action, white secondary action, device check, event feed, and tournament-style school standings.

The implementation intentionally uses editable HTML for the title, copy and controls rather than baking text into the generated artwork. This produces slightly flatter title depth than the source mock, but preserves responsive reflow, accessibility, localization and real interactions.

## Focused region comparison evidence

The hero region was inspected at desktop and mobile sizes because it contains the fidelity-critical generated background, crest, title, actions and navigation. The asset crop remains sharp; the title stays legible over the low-detail center of the generated background; actions remain visible above the fold; the 390px layout has no horizontal overflow (`scrollWidth 375 <= innerWidth 390`).

The standings, leaderboard and feature regions use real text and existing live data. Their styling follows the source's tournament-table language while retaining the project's existing data interfaces.

## Required fidelity surfaces

- Fonts and typography: Noto Sans TC and Outfit are retained; hierarchy, weights and line heights remain readable. Display text uses the source's gold/blue game treatment without becoming raster text.
- Spacing and layout rhythm: hero, event feed and standings proportions follow the source. Desktop content is centered within the existing 1200px container; mobile actions become a single column with 44px+ targets.
- Colors and tokens: sapphire navy, vivid blue, violet, gold and the three school colors map directly to the selected visual direction with stronger contrast than CP26.
- Image quality and asset fidelity: the hero background and crest are generated production assets, not CSS/SVG substitutes. Both load locally with HTTP 200 and are copied into `dist/`.
- Copy and content: existing Traditional Chinese copy, URLs, DOM IDs and live data semantics are preserved.
- Icons: Material Symbols Rounded replaces mixed structural emoji on the redesigned homepage. Dynamic mineral emoji remain only as existing content inside legacy educational modals.
- Accessibility: semantic landmarks and headings are present; tabs expose `aria-pressed`; focus-visible styling, reduced-motion behavior and mobile tap sizes are implemented.

## Comparison history

### Pass 1

- Finding [P3]: the legacy global mobile media rule hid the entire top navigation at widths below 768px, although the main hero challenge action remained available.
- Fix: CP27 now explicitly keeps the navigation list visible, hides secondary links progressively, and retains the compact `開始挑戰` link on phone widths.
- Post-fix evidence: the fresh mobile DOM snapshot exposes a single top navigation link named `開始挑戰`; the hero continues to expose both core actions and the equipment test.

No P0, P1 or P2 findings were identified in the full-view and focused-region comparisons.

## Primary interactions checked

- Required destination contracts exist for `join.html`, `join.html?redirect=index.html`, `#leaderboard`, `teacher.html` and `admin.html`.
- All 29 JavaScript-dependent homepage IDs are present exactly once.
- Equipment test, level, handbook and mining modal IDs and handlers remain connected.
- Leaderboard tabs retain their existing function and now expose pressed state via classes and ARIA.
- School standings retain the original Supabase source and now reorder rows by `total_school_score`.

## Console and build evidence

- `npm.cmd run check`: passed.
- Inline scripts: passed.
- JSON validation: passed.
- `npm.cmd run build:pages`: passed.
- Browser DOM loaded the complete redesigned page and live activity data without a blocking render error.

## Follow-up polish

- [Resolved] The hero title no longer uses heavy text strokes. Gold and sapphire tonal fills with a restrained shadow now preserve editable HTML text while matching the selected concept's polished gem-metal finish more closely.
- [Resolved] The four platform-feature cards now use a consistent set of custom transparent gem-academy badges instead of generic blue Material Symbol tiles. All four images loaded at their intended 72px display size in browser QA.
- [P3] Small phones prioritize the central crystal and path; the right-side academy is mostly cropped, which is acceptable because the primary content remains clear.

final result: passed

---

# CP30 app.html design QA

## Visual target

- Source system: published CP27 homepage, CP28 student join entry and CP29 classroom entry.
- Intended extension: navy academy top bar, bright high-contrast challenge card, sapphire/gold active states, gem imagery and readable learning-record sidebar.

## Completed checks

- Static source and inline JavaScript validation passed.
- Production build passed and includes the updated `app.html` plus existing gem assets.
- Unauthenticated browser navigation correctly redirects to `join.html`; the authentication guard remains intact.

## Blocking visual check

- The in-app browser has no authenticated student session, so the real challenge DOM redirects before it can be captured.
- A script-free data URL preview was rejected by browser security policy and was not retried or bypassed.
- Login-protected spelling, speech, sentence and completion states therefore still require visual capture in an authenticated local browser session.

## Release decision

- Local OAuth returns to the configured cloud page, so the authenticated local state cannot be retained for this QA pass.
- The user explicitly accepted publishing CP30 before authenticated visual capture and requested that any remaining issues be corrected through follow-up iterations on the deployed site.
- This is a release exception, not evidence that the protected states were visually verified.

final result: blocked

---

# CP31 student modal and handbook design QA

## Visual target

- Source system: CP27–CP30 Gem Adventure Academy design language.
- Scope: homepage level, voice helper, handbook and mining modals; challenge-center level and upgrade modals.

## Evidence and findings

- Public voice-helper modal opened and closed successfully in the browser.
- Captured modal uses the intended white academy card, sapphire action, navy heading, blue top accent and softened overlay.
- Browser metrics: 450px modal width, no horizontal overflow and no console errors.
- Handbook tab state now synchronizes visual `is-active` styling with `aria-selected`.
- Build and static validation cover all protected modal markup and existing JavaScript IDs.

## Follow-up

- Authenticated handbook data cards, mining stages and gem-upgrade modal remain production follow-up checks because local OAuth returns to the cloud site.
- The user requested direct publication and accepted follow-up visual correction on the deployed experience.

final result: passed

---

# CP29 class.html design QA

## Visual target

- Source system: published CP27 homepage and CP28 student join entry.
- Page role: a focused classroom mission pass using the same academy environment, navy navigation, sapphire/gold hierarchy, white task card and competition gem asset.

## Evidence and findings

- Desktop browser capture shows the intended two-column hierarchy with three joining steps and a single dominant six-digit code task.
- Crest and competition badge loaded successfully; no placeholder or Emoji asset remains in the primary interface.
- Browser metrics: no horizontal overflow, 70px code input and 58px primary action.
- Input filtering changed `12a3` to `123`; submitting it exposed the correct validation message without starting authentication.
- Browser console reported no errors.

No P0, P1 or P2 findings remain.

final result: passed

---

# CP28 join.html design QA

## Visual target

- Source system: the user-approved and published CP27 Gem Adventure Academy homepage.
- Reused visual language: navy academy navigation, sapphire/gold title treatment, bright academy scene, white high-contrast task cards, gem badge imagery and three-school accent colors.

## Evidence and findings

- Desktop browser capture shows the intended two-column hierarchy: academy invitation and school identity on the left, focused student login task on the right, and three challenge previews below.
- All crest and feature images loaded successfully; no placeholder, Emoji or broken image remains in the main entry experience.
- The login card, school selector and Google CTA remain legible against the scene and retain clear focus/hover states.
- Browser layout metrics report no horizontal overflow. CSS breakpoints at 800px and 480px convert the view to a single column and keep the primary CTA above 44px.
- School selector interaction updated both `value` and `data-school` to `鳳岡國小`.
- Browser console reported no errors.

No P0, P1 or P2 findings remain.

## Follow-up polish

- [P3] Exact 390×844 screenshot capture was unavailable in the in-app browser viewport override during this pass; the 390px rules were verified structurally and will be rechecked visually if the browser override becomes available before publication.

final result: passed
