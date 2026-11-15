import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, Funnel, X } from "@phosphor-icons/react";

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove?: () => void;
}

interface ExpandableFilterBarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeCount: number;
  chips?: ActiveFilterChip[];
  onResetAll?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  panelTitle?: string;
}

export function ExpandableFilterBar({
  isOpen,
  onToggle,
  activeCount,
  chips = [],
  onResetAll,
  leading,
  trailing,
  children,
  className = "",
  panelTitle = "Filter Options",
}: ExpandableFilterBarProps) {
  return (
    <div className={`glass-panel flex flex-col gap-3 p-3.5 sm:p-4 ${className}`}>
      {/* Compact Primary Bar */}
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2 min-w-0">
          {leading}

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${
              isOpen || activeCount > 0
                ? "border-indigo-300/90 bg-indigo-50/90 text-indigo-900 shadow-sm hover:bg-indigo-100/90"
                : "border-white/80 bg-white/75 text-ink-soft hover:bg-white hover:text-ink"
            }`}
          >
            <Funnel size={14} weight={activeCount > 0 ? "fill" : "bold"} className="text-primary" />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-extrabold text-white">
                {activeCount}
              </span>
            )}
            <CaretDown
              size={12}
              weight="bold"
              className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Compact active filter summary chips when filters are set */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-white/85 px-2.5 py-1 text-[11px] font-bold text-indigo-900 shadow-2xs"
                >
                  <span>{chip.label}</span>
                  {chip.onRemove && (
                    <button
                      type="button"
                      onClick={chip.onRemove}
                      aria-label={`Remove filter ${chip.label}`}
                      className="rounded-full p-0.5 text-indigo-500 transition hover:bg-indigo-100 hover:text-indigo-900 cursor-pointer"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  )}
                </span>
              ))}

              {onResetAll && (
                <button
                  type="button"
                  onClick={onResetAll}
                  className="rounded-full px-2 py-1 text-[11px] font-bold text-ink-soft transition hover:bg-white/70 hover:text-ink cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {trailing && <div className="flex flex-wrap items-center gap-2 shrink-0">{trailing}</div>}
      </div>

      {/* Expandable Drawer Panel */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 rounded-2xl border border-white/80 bg-white/55 p-4 shadow-inner backdrop-blur-md">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">
                  {panelTitle}
                </span>
                <div className="flex items-center gap-3">
                  {onResetAll && activeCount > 0 && (
                    <button
                      type="button"
                      onClick={onResetAll}
                      className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                    >
                      Reset to defaults
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onToggle}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-ink-soft hover:bg-white hover:text-ink cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>

              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
