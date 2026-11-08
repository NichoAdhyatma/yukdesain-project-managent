"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import Viewer from "viewerjs";
import { cn } from "@/lib/utils";

/**
 * Viewer gambar layar penuh berbasis viewer.js.
 *
 * - `ImageViewerGroup` membuat satu viewer untuk semua `ViewableImage` di dalamnya,
 *   jadi panah kiri/kanan berpindah antargambar dalam grup itu.
 * - `ViewableImage` adalah tombol berisi thumbnail. Bisa dibuka dengan klik, Enter, atau Spasi.
 * - `ImageViewer` adalah grup berisi satu gambar (API lama, dipakai halaman lain).
 *
 * Keyboard saat viewer terbuka: Escape menutup, panah kiri/kanan pindah gambar,
 * panah atas/bawah zoom, Tab berputar di tombol toolbar, Ctrl+0 ukuran asli.
 */

const VIEWABLE_ATTR = "data-viewable";

const TOOLBAR_LABELS: Record<string, string> = {
  "zoom-in": "Perbesar",
  "zoom-out": "Perkecil",
  "one-to-one": "Ukuran asli",
  reset: "Kembalikan posisi",
  prev: "Gambar sebelumnya",
  next: "Gambar berikutnya",
  "rotate-left": "Putar ke kiri",
  "rotate-right": "Putar ke kanan",
};

type ViewerInternals = { viewer?: HTMLElement };

type GroupContextValue = {
  open: (img: HTMLImageElement) => void;
  refresh: () => void;
};

const GroupContext = createContext<GroupContextValue | null>(null);

function viewerElement(viewer: Viewer | null): HTMLElement | null {
  return (viewer as unknown as ViewerInternals | null)?.viewer ?? null;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('[tabindex="0"], button, [href]')
  ).filter((el) => el.offsetParent !== null);
}

/** Lengkapi markup viewer.js: label bahasa Indonesia dan tombol tutup yang bisa difokus. */
function decorateViewer(root: HTMLElement) {
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Pratinjau gambar");
  root.querySelector(".viewer-toolbar")?.removeAttribute("aria-hidden");
  root.querySelectorAll<HTMLElement>(".viewer-toolbar li").forEach((li) => {
    const key = Array.from(li.classList)
      .map((c) => c.replace(/^viewer-/, ""))
      .find((c) => c in TOOLBAR_LABELS);
    if (key) {
      li.setAttribute("aria-label", TOOLBAR_LABELS[key]);
      li.setAttribute("title", TOOLBAR_LABELS[key]);
    }
  });
  root.querySelectorAll<HTMLElement>(".viewer-list li").forEach((li, i, all) => {
    const alt = li.querySelector("img")?.getAttribute("alt") || "Gambar";
    li.setAttribute("aria-label", `${alt} (${i + 1} dari ${all.length})`);
  });
  const close = root.querySelector<HTMLElement>(".viewer-button");
  if (close) {
    close.removeAttribute("aria-hidden");
    close.setAttribute("tabindex", "0");
    close.setAttribute("aria-label", "Tutup pratinjau");
    close.setAttribute("title", "Tutup (Esc)");
  }
}

export function ImageViewerGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const refreshFrame = useRef<number | null>(null);
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const detachKeys = useCallback(() => {
    if (keyHandlerRef.current) {
      window.removeEventListener("keydown", keyHandlerRef.current, true);
      keyHandlerRef.current = null;
    }
  }, []);

  const ensureViewer = useCallback((): Viewer | null => {
    const container = containerRef.current;
    if (!container) return null;
    if (viewerRef.current) return viewerRef.current;

    const viewer: Viewer = new Viewer(container, {
      className: "yd-viewer",
      filter: (image: HTMLImageElement) => image.hasAttribute(VIEWABLE_ATTR),
      button: true,
      navbar: true,
      title: [1, (image: HTMLImageElement) => image.alt || "Gambar"],
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        // 2 = hanya tampil di layar ≥768px, supaya toolbar muat satu baris di HP.
        oneToOne: 2,
        reset: true,
        prev: true,
        next: true,
        rotateLeft: true,
        rotateRight: true,
      },
      tooltip: true,
      movable: true,
      zoomable: true,
      rotatable: true,
      scalable: false,
      transition: true,
      fullscreen: false,
      keyboard: true,
      focus: true,
      loop: true,
      zoomRatio: 0.2,
      minZoomRatio: 0.1,
      maxZoomRatio: 8,
      zIndex: 9999,
      zoomOnWheel: true,
      toggleOnDblclick: true,
      shown() {
        const root = viewerElement(viewer);
        if (!root) return;
        decorateViewer(root);

        // Tangkap keydown sebelum listener document milik dialog lain (mis. Dialog base-ui),
        // supaya Escape hanya menutup viewer, dan Tab tidak keluar dari viewer.
        const onKey = (event: KeyboardEvent) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            viewer.hide();
            return;
          }
          if (event.key === "Tab") {
            const items = focusableIn(root);
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (!root.contains(active)) {
              event.preventDefault();
              first.focus();
            } else if (event.shiftKey && active === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && active === last) {
              event.preventDefault();
              first.focus();
            }
          }
        };
        detachKeys();
        keyHandlerRef.current = onKey;
        window.addEventListener("keydown", onKey, true);

        if (!root.contains(document.activeElement)) {
          root.querySelector<HTMLElement>(".viewer-button")?.focus();
        }
      },
      // Navbar thumbnail baru dibangun setelah `shown`, jadi labelnya dipasang ulang tiap gambar tampil.
      viewed() {
        const root = viewerElement(viewer);
        if (root) decorateViewer(root);
      },
      hidden() {
        detachKeys();
        triggerRef.current?.focus();
      },
    });
    viewerRef.current = viewer;
    return viewer;
  }, [detachKeys]);

  const open = useCallback(
    (img: HTMLImageElement) => {
      const container = containerRef.current;
      if (!container) return;
      const images = Array.from(
        container.querySelectorAll<HTMLImageElement>(`img[${VIEWABLE_ATTR}]`)
      );
      const index = images.indexOf(img);
      if (index < 0) return;
      triggerRef.current = img.closest("button");
      ensureViewer()?.view(index);
    },
    [ensureViewer]
  );

  // Daftar gambar berubah (mis. update baru masuk): minta viewer.js membaca ulang.
  const refresh = useCallback(() => {
    if (refreshFrame.current !== null) return;
    refreshFrame.current = requestAnimationFrame(() => {
      refreshFrame.current = null;
      viewerRef.current?.update();
    });
  }, []);

  useEffect(() => {
    return () => {
      if (refreshFrame.current !== null) cancelAnimationFrame(refreshFrame.current);
      detachKeys();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [detachKeys]);

  const value = useMemo(() => ({ open, refresh }), [open, refresh]);

  return (
    <GroupContext.Provider value={value}>
      <div ref={containerRef} className={className}>
        {children}
      </div>
    </GroupContext.Provider>
  );
}

interface ViewableImageProps {
  src: string;
  alt: string;
  /** Kelas untuk tombol pembungkus. */
  className?: string;
  /** Kelas untuk elemen <img>. */
  imgClassName?: string;
}

export function ViewableImage({ src, alt, className, imgClassName }: ViewableImageProps) {
  const group = useContext(GroupContext);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    group?.refresh();
    return () => group?.refresh();
  }, [group, src]);

  return (
    <button
      type="button"
      onClick={() => imgRef.current && group?.open(imgRef.current)}
      aria-label={`Buka gambar: ${alt}`}
      className={cn(
        "block w-full cursor-zoom-in rounded-[inherit] outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        {...{ [VIEWABLE_ATTR]: "" }}
        // pointer-events-none: klik selalu jatuh ke tombol, jadi pembukaan viewer hanya lewat satu jalur.
        className={cn("pointer-events-none", imgClassName)}
      />
    </button>
  );
}

interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  containerClassName?: string;
}

/** Satu gambar dengan viewer sendiri. Untuk beberapa gambar, pakai `ImageViewerGroup`. */
export function ImageViewer({
  src,
  alt = "",
  className,
  imgClassName,
  containerClassName,
}: ImageViewerProps) {
  return (
    <ImageViewerGroup className={containerClassName}>
      <ViewableImage src={src} alt={alt || "Gambar"} className={className} imgClassName={imgClassName} />
    </ImageViewerGroup>
  );
}
