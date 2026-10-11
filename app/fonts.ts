import localFont from "next/font/local";

// Bundle the existing Latin webfonts so production builds never fetch Google Fonts.
export const inter = localFont({
  src: "./fonts/Inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  style: "normal",
  display: "swap",
  fallback: ["Arial"],
  adjustFontFallback: "Arial",
});

export const cormorant = localFont({
  src: "./fonts/CormorantGaramond-latin.woff2",
  variable: "--font-cormorant",
  weight: "400 600",
  style: "normal",
  display: "swap",
  fallback: ["Times New Roman"],
  adjustFontFallback: "Times New Roman",
});
