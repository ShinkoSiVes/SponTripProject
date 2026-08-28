---
name: Vivid Logic
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#3a4a49'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#6a7a7a'
  outline-variant: '#b9cac9'
  surface-tint: '#006a6a'
  primary: '#006a6a'
  on-primary: '#ffffff'
  primary-container: '#00ffff'
  on-primary-container: '#007272'
  inverse-primary: '#00dddd'
  secondary: '#7b00ca'
  on-secondary: '#ffffff'
  secondary-container: '#9d05ff'
  on-secondary-container: '#f7e6ff'
  tertiary: '#575e70'
  on-tertiary: '#ffffff'
  tertiary-container: '#dfe5fb'
  on-tertiary-container: '#5f6678'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#00fbfb'
  primary-fixed-dim: '#00dddd'
  on-primary-fixed: '#002020'
  on-primary-fixed-variant: '#004f4f'
  secondary-fixed: '#f1daff'
  secondary-fixed-dim: '#dfb7ff'
  on-secondary-fixed: '#2d004f'
  on-secondary-fixed-variant: '#6b00b0'
  tertiary-fixed: '#dce2f7'
  tertiary-fixed-dim: '#c0c6db'
  on-tertiary-fixed: '#141b2b'
  on-tertiary-fixed-variant: '#404758'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  neon-cyan: '#00FFFF'
  electric-purple: '#9D00FF'
  slate-dark: '#111827'
  slate-muted: '#1F2937'
  border-black: '#000000'
  success-green: '#22C55E'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-bold:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '700'
    lineHeight: '1.0'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-sm: 16px
  margin-md: 32px
  margin-lg: 64px
  card-gap: 24px
---

## Brand & Style

The brand identity for this design system is "Neubrutalist-light"—a strategic blend of high-energy aesthetics and professional minimalism. It is designed to evoke a sense of immediacy, playfulness, and unwavering reliability. The system serves a target audience that values speed and clarity in their decision-making processes.

**Core Principles:**
- **Calculated Energy:** Use vibrant neon accents against stark backgrounds to direct focus without overwhelming the user.
- **Structural Integrity:** Heavy, high-contrast borders provide a "blueprint" feel that suggests stability and technical precision.
- **Kinetic Feedback:** Every interaction should feel tactile; elements don't just change, they react with intentionality.
- **Progressive Clarity:** Information is revealed in a sequential, card-based flow to reduce cognitive load and maintain momentum.

## Colors

The palette is built on a foundation of extreme contrast. 

- **Foundation:** A clean `#FFFFFF` background ensures maximum legibility and allows accent colors to pop. 
- **Accents:** **Neon Cyan** is the primary action color, used for "Go" states, primary buttons, and progress indicators. **Electric Purple** serves as the secondary accent for highlights, toggles, and interactive variety.
- **Structure:** All structural lines, borders, and primary headings use **Border Black** (`#000000`) or **Slate Dark** (`#111827`).
- **Interactive States:** For hover states, apply a hard offset shadow in the accent color rather than changing the background lightness. For active/pressed states, shift the element 2px down and 2px right to "snap" it into the surface.

## Typography

The typography system emphasizes a "tech-utility" aesthetic. 

- **Headlines:** Use **Inter** with heavy weights (Bold to Black) and tight letter spacing to create impactful, modern titles. 
- **Body Text:** **Inter** Regular provides a neutral, highly readable experience for descriptions and instructions.
- **UI Labels:** **JetBrains Mono** is introduced for labels, status chips, and metadata to reinforce the precise, "fast-paced" nature of the design system.

**Scaling:** On mobile devices, headline sizes drop slightly to maintain screen real estate while increasing line height for touch-target clarity in labels.

## Layout & Spacing

This design system utilizes a **Fluid Grid** with a strict 4px baseline rhythm. 

- **Desktop:** 12-column grid with 24px gutters and 64px outer margins.
- **Mobile:** 4-column grid with 16px gutters and 16px outer margins.
- **The Sequential Workflow:** Centralize card-based content. Each step in the "Spontrip" funnel is housed in a card that occupies 6–8 columns on desktop and 4 columns on mobile.
- **Rhythm:** Use large vertical spacing (`margin-lg`) between logical sections to maintain the minimalist feel, but tight internal spacing (`unit` * 2) within component groups (e.g., a label and its input).

## Elevation & Depth

This system rejects soft shadows in favor of **Hard Brutalist Offsets**. 

- **Surface Levels:** 
  1. **Base:** White (`#FFFFFF`).
  2. **Card Layer:** White surface with a 2px solid `#000000` border.
  3. **Interactive Layer:** When hovered, cards and buttons sprout a 4px or 8px "hard shadow"—a solid block of color (Cyan or Purple) offset to the bottom-right.
- **Zero-Softness Policy:** No blurs, no gradients, and no transparency. Depth is communicated strictly through border thickness and solid color offsets.
- **Progressive Depth:** As a user moves through the card-based workflow, previous cards may "stack" behind the active card using a simple 4px vertical offset to show history.

## Shapes

The shape language is "Soft-Brutalist." While the borders are heavy and the colors are loud, slight corner rounding (`0.25rem`) prevents the UI from feeling aggressive or dated.

- **Standard Elements:** Inputs, cards, and buttons use a `0.25rem` radius.
- **Interactive Pills:** Category selectors and "quick-select" chips use a fully rounded (pill-shaped) radius to distinguish them from structural cards.
- **Borders:** Consistency is key. Primary containers use a `2px` black border. Smaller UI elements (pills, inputs) use a `1px` black border.

## Components

- **Buttons:** Primary buttons feature a `2px` black border, Neon Cyan background, and a `4px` black hard-offset shadow. On hover, the shadow shifts to Electric Purple. On active, the button moves `2px` down/right and the shadow shrinks.
- **Cards:** White background, `2px` black border. Used for the sequential workflow. Each card should have a clear "Step Label" in JetBrains Mono at the top-left.
- **Interactive Pills:** For group sizes or categories. White background with a `1px` border. When selected, the background fills with Neon Cyan and the text becomes Bold.
- **Progress Bars:** A `2px` black border container with a solid Neon Cyan fill. The fill does not have a gradient; it grows in discrete blocks if possible.
- **Input Fields:** Rectangular with a `1px` black border. Focus state is indicated by a Neon Cyan border and a 2px offset shadow.
- **Lists:** Clean, non-bordered rows separated by `1px` slate-muted lines. High-contrast hover states (Cyan background) for list items.