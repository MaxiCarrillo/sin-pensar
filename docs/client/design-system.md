# Client design system

## Current evidence

- `src/index.css` owns the white light-mode base, semantic color/spacing/radius/shadow tokens, reset, and global focus/reduced-motion rules.
- Colocated CSS Modules own product layout and visual composition. Ant Design owns behavior-rich `Button`, `Input`, `Drawer`, and `Tooltip` controls; `src/core/theme/theme.ts` maps the Sin Pensar palette and control tokens into `ThemeConfig`.
- The implemented palette is white with primary `#00AAB7`, secondary `#DE2C6E`, and tertiary `#11B087`. No dark algorithm is configured.
- Spanish product copy, labeled icon controls, native avatar radios, status announcements, and non-color roster feedback are present. Automated browser accessibility and viewport tests are not configured.

## Target rules

- Use a white `#FFF` background with primary `#00AAB7`, secondary `#DE2C6E`, and tertiary `#11B087`. Express reusable roles through semantic custom properties in `src/index.css`, not scattered literals.
- Use `*.module.css` colocated with components. Keep global CSS limited to tokens, reset/base behavior, and intentional application-wide rules.
- Prefer Ant Design for established control behavior and apply product-specific CSS Module classes through component and semantic `classNames`; keep reusable theme decisions centralized.
- Preserve Spanish product copy. Technical names, comments, and docs remain English.
- Use semantic HTML, keyboard-operable controls, visible focus, accessible names, practical touch targets, and feedback that does not depend on color alone.
- Design explicit idle, transition, empty, active, paused, completed, recoverable-error, and destructive-confirmation states when applicable.
- Check at least 320px and 390px widths, plus wider layouts, for overflow, long names, zoom, and touch usability. Do not claim responsiveness or accessibility without evidence.
