"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleItems, type BranchId, type MapBranch } from "./brain-map";

// Mind map pengetahuan bot (docs/BOT_AI_PAGE.md §3). Tata letak HTML/CSS; garis penghubung SVG dihitung dari
// posisi node yang dirender, jadi tetap pas saat ukuran layar atau isi berubah.

type Props = {
  center: string;
  branches: MapBranch[];
  icons: Record<BranchId, ReactNode>;
  onSelect: (branch: BranchId, item?: string) => void;
};

type Line = { d: string; key: string };

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

export function KnowledgeMindMap({ center, branches, icons, onSelect }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      const base = root.getBoundingClientRect();
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left - base.left, right: r.right - base.left, midY: r.top - base.top + r.height / 2 };
      };
      const hub = root.querySelector("[data-map-center]");
      if (!hub) return;
      const h = rect(hub);
      const next: Line[] = [];
      for (const node of root.querySelectorAll<HTMLElement>("[data-map-branch]")) {
        const side = node.dataset.side;
        const b = rect(node);
        const fromX = side === "left" ? h.left : h.right;
        const toX = side === "left" ? b.right : b.left;
        next.push({ key: `c-${node.dataset.mapBranch}`, d: curve(fromX, h.midY, toX, b.midY) });
        for (const child of root.querySelectorAll<HTMLElement>(`[data-map-child="${node.dataset.mapBranch}"]`)) {
          const c = rect(child);
          const startX = side === "left" ? b.left : b.right;
          const endX = side === "left" ? c.right : c.left;
          next.push({ key: `i-${node.dataset.mapBranch}-${child.dataset.key}`, d: curve(startX, b.midY, endX, c.midY) });
        }
      }
      setLines(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [branches]);

  const column = (side: "left" | "right") => (
    <div className={cn("flex flex-col gap-7", side === "left" ? "items-end" : "items-start")}>
      {branches
        .filter((b) => b.side === side)
        .map((branch) => (
          <MapBranchRow key={branch.id} branch={branch} icon={icons[branch.id]} onSelect={onSelect} />
        ))}
    </div>
  );

  return (
    <div ref={container} className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-x-14 py-6" role="group" aria-label="Mind map pengetahuan bot">
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {lines.map((l) => (
          <path key={l.key} d={l.d} fill="none" className="stroke-border" strokeWidth={1.5} />
        ))}
      </svg>
      {column("left")}
      <div
        data-map-center
        className="relative z-10 flex flex-col items-center gap-1 rounded-full bg-primary px-6 py-4 text-center text-primary-foreground shadow-sm"
      >
        <Bot className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-semibold">{center}</span>
      </div>
      {column("right")}
    </div>
  );
}

function MapBranchRow({
  branch,
  icon,
  onSelect,
}: {
  branch: MapBranch;
  icon: ReactNode;
  onSelect: Props["onSelect"];
}) {
  const left = branch.side === "left";
  const { shown, hidden } = visibleItems(branch);
  const node = (
    <button
      type="button"
      data-map-branch={branch.id}
      data-side={branch.side}
      onClick={() => onSelect(branch.id)}
      className={cn(
        "relative z-10 flex w-44 shrink-0 flex-col gap-0.5 rounded-xl border bg-card px-3 py-2 text-left shadow-xs outline-none transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        branch.note && "border-amber-400 dark:border-amber-600",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {branch.title}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {branch.meta}
        {branch.locked && " · dikunci"}
      </span>
      {branch.note && <span className="text-xs text-amber-700 dark:text-amber-300">{branch.note}</span>}
    </button>
  );
  const children = (
    <ul className={cn("flex min-w-0 flex-col gap-1.5", left ? "items-end" : "items-start")}>
      {shown.map((item) => (
        <li key={item.id} className="max-w-full">
          <button
            type="button"
            data-map-child={branch.id}
            data-key={item.id}
            onClick={() => onSelect(branch.id, item.id)}
            title={item.title}
            className="relative z-10 block max-w-[13rem] truncate rounded-lg border bg-background px-2.5 py-1 text-left text-sm outline-none transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
          >
            {item.title}
          </button>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            data-map-child={branch.id}
            data-key="more"
            onClick={() => onSelect(branch.id)}
            className="relative z-10 rounded-lg border border-dashed bg-background px-2.5 py-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            +{hidden} lainnya
          </button>
        </li>
      )}
      {branch.items.length === 0 && branch.emptyText && (
        <li className={cn("max-w-[13rem] text-xs text-muted-foreground", left ? "text-right" : "text-left")}>{branch.emptyText}</li>
      )}
    </ul>
  );
  return (
    <div className="flex items-center gap-8">
      {left ? (
        <>
          {children}
          {node}
        </>
      ) : (
        <>
          {node}
          {children}
        </>
      )}
    </div>
  );
}
