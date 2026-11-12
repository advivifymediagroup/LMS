import { IBM_Plex_Mono, Manrope } from "next/font/google";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const fontVars = `${manrope.variable} ${plexMono.variable}`;
