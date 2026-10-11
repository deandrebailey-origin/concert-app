import "server-only";

/** Demo tools only run in `npm run dev`, or when DEMO_TOOLS=1 is set. */
export const demoToolsEnabled = () =>
  process.env.NODE_ENV !== "production" || process.env.DEMO_TOOLS === "1";

export const DEMO_EMAIL_DOMAIN = "demo.certifi.test";

export const DEMO_FRIENDS = [
  { name: "Maya (demo)", email: `maya@${DEMO_EMAIL_DOMAIN}`, artists: ["SZA", "Daniel Caesar", "Summer Walker", "Brent Faiyaz", "H.E.R."] },
  { name: "Jordan (demo)", email: `jordan@${DEMO_EMAIL_DOMAIN}`, artists: ["Bad Bunny", "Karol G", "Rauw Alejandro", "Feid", "Young Miko"] },
  { name: "Sam (demo)", email: `sam@${DEMO_EMAIL_DOMAIN}`, artists: ["Phoebe Bridgers", "Clairo", "Steve Lacy", "The 1975", "Mitski"] },
];
