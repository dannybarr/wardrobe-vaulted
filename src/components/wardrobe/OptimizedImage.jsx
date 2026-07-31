import { forwardRef } from "react";

/**
 * Wardrobe images come from private, signed storage links, so they are served
 * as-is with sensible loading defaults.
 */
export const OptimizedImage = forwardRef(function OptimizedImage(
  { src, alt = "", sizes = "100vw", breakpoints, quality, priority = false, loading, decoding, ...props },
  ref,
) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      sizes={sizes}
      loading={loading || (priority ? "eager" : "lazy")}
      decoding={decoding || "async"}
      {...props}
    />
  );
});
