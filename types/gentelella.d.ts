// Gentelella v4 — TypeScript declarations for the public JS surface.
//
// Drop this file at `types/gentelella.d.ts` and add `"types": "types/gentelella.d.ts"`
// to `package.json` (already done). VS Code then resolves type info for every
// `import { ... } from 'src/v4/...'` automatically — no tsconfig needed,
// no .ts files required, IntelliSense + parameter hints just work.
//
// If you DO use TypeScript, you can also `import type { ModalAction } from
// 'gentelella'` etc. — the named exports below are reachable via the
// per-module declarations.

// ────────────────────────────────────────────────────────────────────────
//  shell.js — admin shell mount + sidebar/topbar/footer render
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/shell' {
  /**
   * Mount the admin shell (sidebar + topbar + footer + interactivity).
   * Reads body data attributes:
   *   `data-shell="admin"` — opt-in (no-op without it)
   *   `data-page="key"`     — matches a NAV item to highlight
   *   `data-breadcrumb="A > B|b.html > C"` — `>`-separated breadcrumb; see `renderTopbar`
   * Idempotent: skips re-rendering if the build-time plugin already injected the shell.
   */
  export function mountShell(): void;
}

declare module 'gentelella/v4/shell-render' {
  export interface NavBadge { text: string; cls: 'badge-red' | 'badge-teal' | 'badge-blue' }

  export interface NavLeaf {
    key: string;
    href: string;
    text: string;
    icon?: keyof typeof ICONS;
    badge?: NavBadge;
  }

  export interface NavParent {
    text: string;
    icon?: keyof typeof ICONS;
    badge?: NavBadge;
    children: Array<Omit<NavLeaf, 'icon'>>;
  }

  export type NavItem = NavLeaf | NavParent;

  export interface NavGroup {
    label: string;
    items: NavItem[];
  }

  export const NAV: readonly NavGroup[];
  export const ICONS: Readonly<Record<string, string>>;

  export interface ShellRenderOptions {
    activeKey?: string;
    breadcrumb?: string[];
  }

  export interface ShellHtml {
    sidebar: string;
    topbar: string;
    footer: string;
  }

  export function renderShell(opts?: ShellRenderOptions): ShellHtml;
  export function renderSidebar(activeKey: string): string;
  /**
   * Render the topbar. Each breadcrumb entry is `"Label"` or `"Label|href"`.
   * The last entry is the current page — rendered as `aria-current="page"`,
   * never a link. Earlier entries link to their explicit `|href`, or to a
   * `NAV` item whose text matches the label (a parent resolves to its first
   * child), or render as plain text when neither applies.
   */
  export function renderTopbar(breadcrumb: string[]): string;
  export function renderFooter(): string;

  /**
   * Parse `data-shell="admin" data-page="…" data-breadcrumb="…"` from a body
   * tag's attribute string. Returns `null` when shell is not opt-in.
   */
  export function parseShellAttrs(attrs: string): {
    activeKey: string;
    breadcrumb: string[];
  } | null;
}

// ────────────────────────────────────────────────────────────────────────
//  toast.js — transient notifications
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/toast' {
  export interface ToastOptions {
    /** Visual style. Defaults to `'default'`. */
    variant?: 'default' | 'success' | 'error' | 'info' | 'warning';
    /** ms before auto-dismiss. Click also dismisses. Defaults to 2600. */
    duration?: number;
  }

  /**
   * Show a transient toast at the top-right.
   * @returns the toast element (so the caller can dismiss it early).
   */
  export function showToast(message: string, opts?: ToastOptions): HTMLDivElement;
}

// ────────────────────────────────────────────────────────────────────────
//  modal.js — focus-trapped dialog
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/modal' {
  export interface ModalActionContext {
    dialog: HTMLElement;
    body: HTMLElement;
    close: () => void;
  }

  export interface ModalAction {
    label: string;
    variant?: 'primary' | 'outline' | 'danger' | 'ghost';
    /**
     * Return `false` to keep the modal open (e.g. validation failed).
     * Otherwise the modal closes after the handler runs.
     */
    action?: (ctx: ModalActionContext) => unknown;
    /** Default `true`. Set false to keep the modal open after `action`. */
    closeOnAction?: boolean;
  }

  export interface ModalOptions {
    title?: string;
    /** HTML string (assigned via innerHTML — must be trusted) or HTMLElement. */
    body?: string | HTMLElement;
    actions?: ModalAction[];
    size?: 'sm' | 'md' | 'lg';
    /** Fires after the modal is dismissed (any reason). */
    onClose?: () => void;
  }

  export interface ModalHandle {
    dialog: HTMLElement;
    body: HTMLElement;
    close: () => void;
  }

  export function showModal(opts?: ModalOptions): ModalHandle;
  export function closeModal(opts?: { skipHook?: boolean }): void;
  export function isModalOpen(): boolean;
}

// ────────────────────────────────────────────────────────────────────────
//  menus.js — popover menu + side panel
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/menus' {
  /** A clickable menu entry; `action` defaults to a no-op when omitted. */
  export interface MenuItem {
    label: string;
    /** Receives the trigger element that opened the menu. */
    action?: (trigger: HTMLElement | null) => void;
  }

  /** A divider; pass the literal string `'-'` between groups. */
  export type MenuEntry = MenuItem | '-';

  /**
   * Open a popover menu anchored to a trigger element. Toggles closed if
   * called again with the same trigger. Auto-closes on outside click,
   * Escape, scroll, or resize.
   */
  export function openMenu(trigger: HTMLElement, items: MenuEntry[]): void;

  /**
   * Like {@link openMenu} but renders arbitrary content inside a wider
   * container (notification panels, message previews, user menus).
   */
  export function openPanel(
    trigger: HTMLElement,
    content: HTMLElement | string,
    opts?: { className?: string; width?: number }
  ): void;

  export function closeMenu(): void;

  /** Default Refresh / Move up / Move down / Hide-card menu used by `.card-opt-btn`. */
  export const DEFAULT_CARD_MENU: readonly MenuEntry[];
}

// ────────────────────────────────────────────────────────────────────────
//  charts.js — ECharts factories + auto-init
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/charts' {
  /**
   * Mount ECharts on every `<div data-chart="…">` on the page. Lazy-imports
   * `echarts/core` plus the chart types and components actually needed.
   * Re-paints on `data-theme` mutation and on a `themechange` custom event.
   */
  export function initCharts(): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────
//  tables.js — DataTables auto-init
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/tables' {
  /**
   * Wire DataTables on every `<table data-datatable>`.
   * Opt-in extras via attribute on the `<table>`:
   *   `data-page-length="25"`       — rows per page
   *   `data-selectable`             — wire row checkboxes
   *   `data-export="filename"`      — show a CSV export button
   * Plus `<th data-orderable="false">` to disable sort per column.
   */
  export function initTables(): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────
//  command-palette.js — ⌘K / Ctrl+K
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/command-palette' {
  /** Wire the global ⌘K shortcut + topbar search-input opener. Idempotent. */
  export function initCommandPalette(): void;
  /** Open programmatically. */
  export function openCommandPalette(): void;
  /** Close programmatically. */
  export function closeCommandPalette(): void;
}

// ────────────────────────────────────────────────────────────────────────
//  page-actions.js — global Print / Export / Compose / etc. dispatcher
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/page-actions' {
  /**
   * Wire shared button-intent handlers (Print / Export / Refresh / Share /
   * Compose / `New <thing>` / Invite). Buttons that don't match an intent
   * pass through unhandled.
   */
  export function initPageActions(): void;
}

// ────────────────────────────────────────────────────────────────────────
//  Lazy-loaded page modules (init functions)
// ────────────────────────────────────────────────────────────────────────

declare module 'gentelella/v4/settings' {
  /** Wire all settings interactions: persistence, save/cancel, integrations, etc. Idempotent. */
  export function initSettings(): void;
}

declare module 'gentelella/v4/form-controls' {
  /**
   * Auto-init advanced form controls:
   *   `[data-date-range]`    — two-month range picker with presets
   *   `[data-rich-text]`     — toolbar editor (bold / italic / lists / link / code)
   *   `[data-multi-select]`  — chip-input with autocomplete
   * Idempotent — safe to call multiple times.
   */
  export function initFormControls(): void;
}

// ────────────────────────────────────────────────────────────────────────
//  CSS custom properties — typed for IDE autocomplete on style.setProperty()
// ────────────────────────────────────────────────────────────────────────

/**
 * Design tokens declared on `:root` in `_tokens.scss`. Use these names
 * with `style.setProperty()` or in `var(--…)` references for autocomplete.
 *
 * @example
 * document.documentElement.style.setProperty('--primary', '#ff0066');
 */
type GentelellaToken =
  // Colors
  | '--primary' | '--primary-lt' | '--primary-dk'
  | '--blue' | '--azure' | '--green' | '--lime' | '--yellow'
  | '--orange' | '--red' | '--pink' | '--purple' | '--indigo' | '--cyan'
  | '--blue-lt' | '--azure-lt' | '--green-lt' | '--yellow-lt'
  | '--red-lt' | '--purple-lt' | '--cyan-lt'
  | '--text' | '--text-secondary' | '--text-muted' | '--text-disabled'
  | '--body-bg' | '--bg-surface' | '--bg-surface-secondary'
  | '--border-color' | '--border-color-light' | '--border-translucent'
  // Sidebar
  | '--sidebar-bg' | '--sidebar-hover' | '--sidebar-active'
  | '--sidebar-text' | '--sidebar-text-hover' | '--sidebar-text-active'
  | '--sidebar-border' | '--sidebar-w'
  // Geometry
  | '--radius' | '--radius-sm' | '--radius-lg'
  | '--space-1' | '--space-2' | '--space-3' | '--space-4'
  | '--space-5' | '--space-6' | '--space-7' | '--space-8'
  // Typography
  | '--font' | '--font-mono' | '--font-size' | '--line-height'
  | '--font-weight-normal' | '--font-weight-medium' | '--font-weight-bold'
  // Effects
  | '--shadow' | '--shadow-card';

interface CSSStyleDeclaration {
  setProperty(property: GentelellaToken, value: string | null, priority?: string): void;
}

export {};
