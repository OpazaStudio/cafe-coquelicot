import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo";
import { getSiteUrl } from "@/lib/stripe";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getSiteUrl());
}
