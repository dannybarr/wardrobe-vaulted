import { forwardRef, type ImgHTMLAttributes } from "react";

/**
 * Wardrobe images come from private, signed storage links, so they are served
 * as-is with sensible loading defaults.
 */
type OptimizedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null | undefined;
  breakpoints?: number[];
  quality?: number;
  priority?: boolean;
};

export const OptimizedImage = forwardRef<HTMLImageElement, OptimizedImageProps>(
  function OptimizedImage(
    {
      src,
      alt = "",
      sizes = "100vw",
      breakpoints: _breakpoints,
      quality: _quality,
      priority = false,
      loading,
      decoding,
      ...props
    },
    ref,
  ) {
    return (
      <img
        ref={ref}
        src={src ?? undefined}
        alt={alt}
        sizes={sizes}
        loading={loading || (priority ? "eager" : "lazy")}
        decoding={decoding || "async"}
        {...props}
      />
    );
  },
);
