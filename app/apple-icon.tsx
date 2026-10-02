import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          background: "linear-gradient(145deg, #4a1f32 0%, #401625 100%)",
          borderRadius: 36,
        }}
      >
        <span style={{ color: "#d982ab", fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>WTF</span>
        <span style={{ color: "#f2c9dc", fontSize: 22, fontWeight: 600, marginTop: 4 }}>Radar</span>
      </div>
    ),
    { ...size },
  );
}
