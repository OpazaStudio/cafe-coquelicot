import { ImageResponse } from "next/og";

export const alt = "Coquelicot — fleuriste à La Rochelle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 168, fontStyle: "italic", lineHeight: 1 }}>coquelicot</div>
        <div
          style={{
            marginTop: 28,
            fontSize: 34,
            letterSpacing: 8,
            textTransform: "uppercase",
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          fleuriste · La Rochelle
        </div>
        <div style={{ marginTop: 18, fontSize: 26, opacity: 0.75, fontFamily: "Helvetica, Arial, sans-serif" }}>
          fleurs fraîches & séchées — cueillies le matin
        </div>
      </div>
    ),
    size,
  );
}
