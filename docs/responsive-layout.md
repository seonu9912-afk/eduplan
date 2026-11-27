# Responsive layout rules

- Use the existing Button component for ordinary actions. Its data-slot and data-size attributes define the shared control size; the mobile target is 44 CSS px.
- A custom control (calendar cell, timetable slot, text trigger, inline list action) owns its geometry. Generic mobile defaults use :where to avoid overriding feature rules. Do not use a broad selector to apply padding to all buttons.
- Shared spacing, radius, typography and control-size tokens live in globals.css. Mobile rules live in mobile.css; layout exceptions live next to the feature. Preserve local table scroll containers instead of hiding body overflow.
- For calendar spans, reserve an independent date track above event lanes. Date targets span the entire cell.
- For home agenda cards, the title and metadata share a single clickable target; related links remain independent.
- Check 320/375/390/430px mobile and 1440px desktop. The new responsive-layout.spec.ts uses the existing isolated operations preview; start the development server with EDUPLAN_LOCAL_PREVIEW=1 and run npm run test:e2e -- tests/e2e/responsive-layout.spec.ts.
- Do not mark a build as browser-verified based only on npm run check. Verify touch and safe-area behavior on iOS separately.
