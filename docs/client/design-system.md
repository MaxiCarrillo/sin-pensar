# Client design system

## Current evidence

- `src/index.css` owns the white light-mode base, semantic color/spacing/radius/shadow tokens, reset, and global focus/reduced-motion rules. Ant Design large controls use the compact default-equivalent `40px` height while component CSS preserves product-specific radii.
- Colocated CSS Modules own product layout and visual composition. Ant Design owns behavior-rich `Button`, `Input`, `Drawer`, and `Tooltip` controls; `src/core/theme/theme.ts` maps the Sin Pensar palette and control tokens into `ThemeConfig`.
- `html` and `body` own the full-width viewport background. `--mobile-breakpoint` is the single interactive application-shell width token and is currently `390px`; `#root` is centered and capped to that width on every route.
- Shared bottom drawers keep their Ant Design mask and panel at viewport level while a centered child content container is capped to the mobile shell width.
- The implemented palette is white with primary `#00AAB7`, secondary `#DE2C6E`, and tertiary `#11B087`. No dark algorithm is configured.
- Spanish product copy, labeled icon controls, native avatar radios, status announcements, and non-color roster feedback are present. Automated browser accessibility and viewport tests are not configured.
- Team assignment uses vertically stacked table-like cards with cycling semantic headers, one-column player rows, explicit remove-to-unassigned controls, and a shared bottom drawer for keyboard-accessible player selection. Team-count choices live in the Players configuration drawer and describe the balanced sizes produced by the finalized roster.
- Private card selection uses a full-height `/cards` shell. Each player sees a private handoff, a dedicated main screen with all 10 dealt cards, and then a dedicated lightning screen whose rendered list is derived by filtering out every main-card ID before mapping. Handoffs mount no card records; saving removes the private card list before the next handoff. Revealed cards scroll inside the bounded content region while phase-specific progress and actions remain visible. Every card is a semantic button with text state, `aria-pressed`, visible focus, a fixed-width selection border, selected opacity `1`, and unselected opacity `0.4`.
- Draft cards use a rounded white shell with a dark fixed-width edge, subtle shadow, blank top cap, and white gutters around three full-width semantic bands: title `#DE2C6E`, character `#11B087`, and everything `#00AAB7`. The category headers are omitted; each value remains centered, each subtype sits at the lower right of its band, and a generous white keyword area retains its label and value. Long values and subtypes wrap without clipping the card's intrinsic height.

## Target rules

- Use a white `#FFF` background with primary `#00AAB7`, secondary `#DE2C6E`, and tertiary `#11B087`. Express reusable roles through semantic custom properties in `src/index.css`, not scattered literals.
- Use `*.module.css` colocated with components. Keep global CSS limited to tokens, reset/base behavior, and intentional application-wide rules.
- Keep viewport backgrounds full-width on `html`/`body` or a viewport-level background layer. Center and cap interactive route content at `width: min(var(--mobile-breakpoint), 100%)` through `#root`; anchor shell actions to that boundary and do not add route-specific desktop max-widths.
- Use El Topo's compact layout scale as the Home and drawer baseline: `1rem` shell and medium spacing, `1.5rem` large spacing, `2rem` extra-bold page titles, `0.75rem` Home supporting text, and `1.25rem` bold drawer titles. Preserve Sin Pensar's identity through the compact bordered Home card, attached gradient question-mark emblem, short title divider, palette, content, and frontend-only flow.
- Keep the Home card visually centered against the viewport by overlaying the bottom-anchored footer on the page grid, reserving equal block clearance around the centering area, and including the attached emblem's overhang in the centered box. Let short viewports grow and scroll rather than clipping overflow.
- Prefer Ant Design for established control behavior and apply product-specific CSS Module classes through component and semantic `classNames`; keep reusable theme decisions centralized.
- Use Ant Design bottom drawers with mask and Escape closing, focus trapping/restoration, `closable={false}`, no visual close control or default header, and an accessible centered `hgroup` title plus description. Keep the mask and panel viewport-level, and cap the drawer's child content container to `--mobile-breakpoint`.
- Compose avatar selection and nickname entry through the shared `AvatarInput`: the avatar opens a keyboard-operable bottom drawer and the controlled Ant Design input keeps clear, count, prefix, required, status, and help semantics stable.
- Preserve Spanish product copy. Technical names, comments, and docs remain English.
- Use semantic HTML, keyboard-operable controls, visible focus, accessible names, practical touch targets, and feedback that does not depend on color alone.
- Design explicit idle, transition, empty, active, paused, completed, recoverable-error, and destructive-confirmation states when applicable.
- Check at least 320px and 390px widths, plus wider layouts, for overflow, long names, zoom, and touch usability. Do not claim responsiveness or accessibility without evidence.
