---
name: Postrack
description: A dark, IDE-native API workspace where method color and tonal layering carry meaning before text does.
colors:
  graphite-canvas: "#1C1C1C"
  charcoal-panel: "#252526"
  slate-surface: "#2D2D2D"
  deep-sidebar: "#1A1A1A"
  header-surface: "#2D2F31"
  input-surface: "#2D2D2D"
  hover-surface: "#3D3D3D"
  active-surface: "#404040"
  border-default: "#3D3D3D"
  border-subtle: "#333333"
  soft-white: "#E0E0E0"
  muted-silver: "#9E9E9E"
  dim-slate: "#6E6E6E"
  inverse-ink: "#1C1C1C"
  action-blue: "#007AFF"
  signal-orange: "#FF6C37"
  success-green: "#73BF69"
  caution-amber: "#FFCA28"
  danger-red: "#EF5350"
  protocol-purple: "#AB47BC"
  method-put: "#64B5F6"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.75
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.75
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.05em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, SF Mono, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#1976D2"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-silver}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input-default:
    backgroundColor: "{colors.input-surface}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  badge-method:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.soft-white}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: Postrack

## Overview

**Creative North Star: "The Precision Workbench"**

Postrack is a dark, IDE-native workspace for API developers who live in the sidebar and request builder. The interface behaves like a well-tuned instrument panel: surfaces are layered in graphite tones, HTTP semantics arrive through color before copy, and orange marks the single moment of active focus. Nothing decorative competes with the task.

The system rejects the heavy corporate feel of enterprise API gateways, the sterile gray-on-gray exhaustion of default developer tools, and the "everything is a card" SaaS template look. Personality comes from method badges, snappy state transitions, and precise density, not from marketing chrome.

**Key Characteristics:**
- Dark-first tonal layering (`bg-primary` through `bg-hover`) instead of shadow stacks
- Method and status color as the primary semantic vocabulary
- Signal Orange reserved for active tabs, selection, and current focus
- Action Blue for primary actions, links, and focus rings
- Compact sidebar typography (11px mono for requests, 12px sans for folders)
- 150ms transitions on all interactive state changes
- Inter for UI chrome, JetBrains Mono for URLs, code, and request names

## Colors

A restrained dark palette where chroma is earned: neutrals carry the workspace, accents appear only when they encode HTTP method, status, or user action.

### Primary
- **Action Blue** (`#007AFF`): Primary buttons, links, focus rings, drag-drop indicators, and informational highlights. The default "do something" accent.
- **Signal Orange** (`#FF6C37`): Active tab underline, selected tree state, link hover, and boolean syntax in JSONC. Reserved for "you are here" moments. Never used as a generic decoration.

### Secondary
- **Success Green** (`#73BF69`): GET methods, success states, ownership indicators (green dot), and positive confirmation.
- **Caution Amber** (`#FFCA28`): POST methods, warnings, and JSONC object keys.
- **Protocol Purple** (`#AB47BC`): PATCH methods, null values in JSONC, and secondary protocol accents.

### Tertiary
- **Sky PUT** (`#64B5F6`): PUT method badges only.
- **Danger Red** (`#EF5350`): DELETE methods, destructive buttons, and error states.

### Neutral
- **Graphite Canvas** (`#1C1C1C`): Main content background, scrollbar track.
- **Charcoal Panel** (`#252526`): Cards, modal bodies, elevated panels.
- **Slate Surface** (`#2D2D2D`): Inputs, tertiary backgrounds, secondary buttons.
- **Deep Sidebar** (`#1A1A1A`): Sidebar chrome, the navigation instrument.
- **Header Surface** (`#2D2F31`): Top bar, distinct from content but still neutral.
- **Hover Surface** (`#3D3D3D`): Row hover, button secondary hover, scrollbar thumb hover.
- **Active Surface** (`#404040`): Selected sidebar rows, pressed states.
- **Soft White** (`#E0E0E0`): Primary text, headings.
- **Muted Silver** (`#9E9E9E`): Secondary text, labels, inactive nav items.
- **Dim Slate** (`#6E6E6E`): Placeholders, disabled hints, comments in JSONC.
- **Border Default** (`#3D3D3D`): Input borders, card edges, dividers.
- **Border Subtle** (`#333333`): Low-contrast separators inside dense panels.

### Named Rules
**The Method-First Rule.** HTTP method color is the fastest scan signal in the sidebar. A developer should identify GET vs POST vs DELETE by hue before reading the request name. Method badges always use 15% opacity tint backgrounds with full-saturation text.

**The Orange Sparingly Rule.** Signal Orange appears on active tabs, selected items, and hover accents only. If orange is on more than one focal element per viewport, the hierarchy is broken.

**The One Accent Per Action Rule.** A single screen region gets one primary action color. Blue for commit actions, red for destructive, green for success confirmation. Never stack competing accents on the same control group.

## Typography

**Display Font:** Inter (with system-ui fallback)
**Body Font:** Inter (with system-ui fallback)
**Label/Mono Font:** JetBrains Mono (with Fira Code, SF Mono fallback)

**Character:** Inter carries the entire UI hierarchy with weight and size contrast, not font pairing drama. JetBrains Mono appears wherever the content is code-shaped: URLs, request names in the tree, response bodies, and variable keys.

### Hierarchy
- **Display** (600, 1.25rem / 20px, 1.75): Modal titles, page-level headers. Rare; the tool is task-dense, not marketing-sparse.
- **Headline** (600, 1.125rem / 18px, 1.75): Section headers, collection names in sidebar.
- **Title** (600, 1rem / 16px, 1.5): Subsection labels, card headers.
- **Body** (400, 0.875rem / 14px, 1.5): Default UI text, form content, descriptions. Cap prose blocks at 65–75ch.
- **Label** (500, 0.75rem / 12px, uppercase, 0.05em tracking): Form field labels, metadata keys, badge-adjacent captions.
- **Mono** (400, 0.6875rem / 11px, 1.4): Request names in sidebar, URLs, code snippets, query param keys.

### Named Rules
**The Mono-For-Code Rule.** Any string that could appear in a terminal, URL bar, or JSON payload uses JetBrains Mono. UI chrome labels stay in Inter.

**The Flat Scale Rule.** Type hierarchy uses a 1.125–1.25 ratio between steps. No fluid clamp sizing. Developer tools are viewed at consistent DPI; a sidebar headline that shrinks on resize looks broken, not responsive.

## Elevation

Depth is conveyed through tonal layering, not shadow stacks. The workbench is flat at rest: `bg-primary` for canvas, `bg-secondary` for panels, `bg-tertiary` for inputs, `bg-hover` for interactive feedback. Borders (`border-default`) separate regions when tone alone is insufficient.

Shadows appear only where a surface must float above the entire workspace: modal overlays (`shadow-modal`: `0 12px 48px rgba(0,0,0,0.5)`) and mobile bottom sheets. Sidebar rows, cards, and request items never carry resting shadows.

### Shadow Vocabulary
- **Ambient Small** (`0 1px 2px rgba(0,0,0,0.3)`): Rare; reserved for dropdown menus if needed.
- **Modal Float** (`0 12px 48px rgba(0,0,0,0.5)`): Dialogs and confirmation overlays only.
- **Overlay Scrim** (`rgba(0,0,0,0.7)` with `backdrop-filter: blur(2px)`): Modal backdrop. Light blur, never glassmorphism as a default surface treatment.

### Named Rules
**The Tonal-First Rule.** Before reaching for a shadow, step up one background token (`primary` → `secondary` → `tertiary` → `hover`). If the surface still doesn't read, add a 1px `border-default` border. Shadows are the last resort.

**The Flat Sidebar Rule.** The navigation tree is always flat. Depth in the sidebar comes from indentation, chevrons, and method color, never from card elevation or nested containers.

## Components

Snappy utilitarian controls: 6px radius, 8px/16px padding on buttons, 150ms ease transitions, compact density tuned for all-day API work.

### Buttons
- **Shape:** Gently rounded (6px / `rounded-md`), inline-flex with 8px gap between icon and label.
- **Primary:** Action Blue background, white text, 8px 16px padding. Hover darkens to `#1976D2`.
- **Secondary:** Slate Surface background, Soft White text, 1px Border Default border. Hover lifts to Hover Surface.
- **Danger:** Danger Red background, white text. Used only in delete confirmation footers.
- **Ghost:** Transparent background, Muted Silver text. Hover fills Hover Surface, text shifts to Soft White.
- **Small variant:** 4px 8px padding, 12px text (`btn-sm`).
- **Focus:** Inherited from global input focus pattern (blue border + soft glow). Buttons rely on hover/active state, not persistent outlines.

### Chips / Method Badges
- **Style:** Uppercase, semibold, 15% opacity method-color tint background, full-saturation method text. Minimum width 52px (md), scales down to 28px (xs) in dense tree rows.
- **State:** Color encodes HTTP verb permanently. No neutral "default" badge; unknown methods fall back to Slate Surface + Soft White.
- **Ownership dot:** 8px (`w-2 h-2`) Success Green circle, right-aligned in tree rows. Indicates "created by you."

### Cards / Containers
- **Corner Style:** 8px (`rounded-lg`).
- **Background:** Charcoal Panel (`bg-secondary`).
- **Shadow Strategy:** None at rest. Refer to Elevation section.
- **Border:** 1px Border Default.
- **Internal Padding:** 16px (`p-4`) for header and body sections.

### Inputs / Fields
- **Style:** Slate Surface background, 1px Border Default stroke, 6px radius, 8px 12px padding, 14px Inter text.
- **Focus:** Border shifts to Action Blue, `box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2)`.
- **Placeholder:** Dim Slate text.
- **Labels:** 12px uppercase Inter, Muted Silver, 0.05em letter-spacing, 4px bottom margin.

### Navigation
- **Sidebar:** Deep Sidebar background, 280px width, 48px header height. Folder rows: 12px semibold sans. Request rows: 11px mono, Muted Silver default, Soft White on hover/select.
- **Tabs:** Bottom 2px border indicator. Inactive: Muted Silver text. Active: Signal Orange text + orange underline. Hover: Soft White text.
- **Tree items:** Hover fills Hover Surface. Active/selected fills Active Surface. Legacy `.tree-item.active` uses left orange stripe; new sidebar components prefer full-row `bg-bg-active` without side-stripe accents.
- **Mobile:** Sidebar becomes a 280px drawer with slide-in-left animation (250ms ease). Bottom nav at 64px with safe-area insets.

### Modals
- **Overlay:** 70% black scrim, 2px backdrop blur.
- **Panel:** Charcoal Panel, 12px radius, 1px border, max-width 480px default. Header/footer separated by Border Default dividers, 16–20px padding.
- **Entry:** `modalEnter` keyframe: scale 0.95 + translateY(-10px) to full size over 200ms.

### Signature Component: MethodBadge
The visual anchor of the entire product. Every request in the sidebar, every tab, every documentation block leads with method color. The badge is never icon-accompanied; the three-letter verb is the icon.

## Do's and Don'ts

Concrete guardrails derived from PRODUCT.md anti-references and the Precision Workbench north star.

### Do:
- **Do** communicate HTTP method and status through color and shape before text labels.
- **Do** use tonal layering (`bg-primary` → `bg-secondary` → `bg-hover`) to establish hierarchy in dense panels.
- **Do** keep sidebar rows compact and scannable: chevron + folder icon + name + count + ownership dot.
- **Do** use 150ms ease transitions for hover, focus, and tab switches. State changes should feel snappy, never choreographed.
- **Do** reserve Signal Orange for active selection and tab indicators.
- **Do** use JetBrains Mono for URLs, request names, and any code-shaped content.
- **Do** respect `prefers-reduced-motion` and maintain WCAG 2.1 AA contrast on all method/status badges.

### Don't:
- **Don't** adopt the heavy, corporate feel of enterprise API gateways. No navy-and-gold authority palettes, no compliance-dashboard density.
- **Don't** fall into sterile gray-on-gray exhaustion. Every neutral has a role; Muted Silver and Dim Slate exist to create readable hierarchy, not to flatten everything into one tone.
- **Don't** use the "everything is a card" SaaS template look. Cards are for modals and isolated panels, not for wrapping every sidebar row or list item.
- **Don't** use colored side-stripe borders greater than 1px on cards, list items, or callouts. Prefer full-row background tints or leading badges.
- **Don't** use gradient text, glassmorphism as a default surface, or decorative motion that doesn't convey state.
- **Don't** stack multiple accent colors in a single control group. One action, one color.
- **Don't** add resting shadows to sidebar items, request rows, or nested tree containers.
- **Don't** use modals when an inline or progressive disclosure pattern would suffice.
