"use client";

import { useEffect, useRef, useCallback } from "react";
import Viewer from "viewerjs";

interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  containerClassName?: string;
}

export function ImageViewer({
  src,
  alt = "",
  className,
  imgClassName,
  containerClassName,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);

  const initViewer = useCallback(() => {
    if (!containerRef.current || !src) return;

    // Destroy existing viewer
    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
    }

    const container = containerRef.current;

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!container) return;

      viewerRef.current = new Viewer(container, {
        button: true,
        navbar: false,
        title: false,
        toolbar: {
          zoomIn: { size: "40px" },
          zoomOut: { size: "40px" },
          oneToOne: { size: "40px" },
          reset: { size: "40px" },
          prev: { size: "40px", show: false },
          play: { size: "40px", show: false },
          next: { size: "40px", show: false },
        },
        tooltip: true,
        movable: true,
        zoomable: true,
        scalable: false,
        transition: true,
        fullscreen: false,
        keyboard: true,
        zoomRatio: 0.2,
        minZoomRatio: 0.1,
        maxZoomRatio: 5,
        zIndex: 9999,
        zoomOnWheel: true,
        toggleOnDblclick: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }, 50);

    return () => clearTimeout(timer);
  }, [src]);

  useEffect(() => {
    const cleanup = initViewer();
    return () => {
      cleanup?.();
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [initViewer]);

  return (
    <div ref={containerRef} className={containerClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={imgClassName}
        onClick={() => viewerRef.current?.show()}
        style={{ cursor: "zoom-in" }}
      />
    </div>
  );
}
