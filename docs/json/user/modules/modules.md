# Modules Panel

The Modules panel shows all loaded frontend modules and lets you enable or disable them at runtime.

## Module List

Each module entry shows:
- **Checkbox** — Enable or disable the module
- **Icon and title** — The module's display name
- **Description** — What the module does
- **Service badge** — Shown for non-panel background modules

Modules are listed in their load priority order.

## Enabling and Disabling

- **Disabling** a module destroys its panel, removing it from the layout.
- **Enabling** a module re-initializes it and creates a new panel instance.

Core modules cannot be disabled (their checkboxes are grayed out).

## Reordering

Use the **up/down arrows** to change a module's load priority. This affects the order in which modules process events and can influence which module handles a given action first.

## Adding External Modules

Click **Add External Module...** to load a module from a custom path or URL. Enter the path to the module's `index.js` file when prompted. External modules are marked with an "(External)" tag in the list.
