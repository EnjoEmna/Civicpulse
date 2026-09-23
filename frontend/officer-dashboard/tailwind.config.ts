import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        "ink-soft": "var(--color-ink-soft)",
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        border: "var(--color-border)",
        sidebar: "var(--color-sidebar)",
        primary: {
          DEFAULT: "var(--color-primary)",
          strong: "var(--color-primary-strong)",
          soft: "var(--color-primary-soft)",
        },
        status: {
          open: "var(--color-status-open)",
          "open-bg": "var(--color-status-open-bg)",
          progress: "var(--color-status-progress)",
          "progress-bg": "var(--color-status-progress-bg)",
          resolved: "var(--color-status-resolved)",
          "resolved-bg": "var(--color-status-resolved-bg)",
          rejected: "var(--color-status-rejected)",
          "rejected-bg": "var(--color-status-rejected-bg)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "ios-sm": "10px",
        "ios-md": "14px",
        "ios-lg": "18px",
        "ios-xl": "22px",
        "ios-2xl": "28px",
        "ios-3xl": "34px",
      },
      boxShadow: {
        "ios-glass": "inset 0 1px 1px 0 rgba(255, 255, 255, 0.85), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.02), 0 8px 30px -4px rgba(15, 23, 42, 0.07), 0 2px 6px -1px rgba(15, 23, 42, 0.04)",
        "ios-glass-hover": "inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.95), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.03), 0 16px 36px -6px rgba(15, 23, 42, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.06)",
        "ios-glass-dark": "inset 0 1px 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 1px 0 rgba(0, 0, 0, 0.3), 0 12px 36px -4px rgba(0, 0, 0, 0.35)",
        "ios-pill": "inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.7), 0 2px 8px -1px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
} satisfies Config;
