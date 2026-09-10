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
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      maxWidth: {
        app: "1200px",
      },
    },
  },
  plugins: [],
} satisfies Config;
