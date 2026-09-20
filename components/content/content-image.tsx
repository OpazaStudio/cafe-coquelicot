import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageValue } from "@/lib/content/fields";
import { productImageUrl } from "@/lib/product-image";

export function hasContentImage(image: ImageValue): image is ImageValue & { path: string } {
  return Boolean(image.path && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function ContentImage({
  image,
  fallback,
  sizes,
  className,
}: {
  image: ImageValue;
  fallback: ReactNode;
  sizes: string;
  className?: string;
}) {
  if (hasContentImage(image)) {
    return (
      <Image
        src={productImageUrl(image.path)}
        alt={image.alt}
        fill
        sizes={sizes}
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  }
  return <>{fallback}</>;
}
