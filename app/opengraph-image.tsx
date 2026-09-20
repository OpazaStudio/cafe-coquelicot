import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Café Coquelicot — fleurs fraîches & séchées";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontsDir = join(process.cwd(), "fonts");

export default async function OpengraphImage() {
  const [tangerine, dmSans, dmSansMedium] = await Promise.all([
    readFile(join(fontsDir, "tangerine/Other Font Files/TangerineRegular.ttf")),
    readFile(join(fontsDir, "dm-sans/DMSans-400.ttf")),
    readFile(join(fontsDir, "dm-sans/DMSans-500.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f3ebe2",
          color: "#870c20",
          fontFamily: "DM Sans",
        }}
      >
        <div
          style={{
            fontFamily: "Tangerine",
            fontSize: 140,
            whiteSpace: "nowrap",
            lineHeight: 1,
            letterSpacing: -2,
            marginTop: -12,
          }}
        >
          café coquelicot
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          fleuriste · fleurs fraîches & séchées
        </div>
        <div style={{ marginTop: 18, fontSize: 26, opacity: 0.75 }}>
          atelier floral — livraison en France
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Tangerine", data: tangerine, weight: 400, style: "normal" },
        { name: "DM Sans", data: dmSans, weight: 400, style: "normal" },
        { name: "DM Sans", data: dmSansMedium, weight: 500, style: "normal" },
      ],
    },
  );
}
