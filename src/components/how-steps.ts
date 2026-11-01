/** The four "How it works" steps. One place: the text tab and the tests both read this. Amounts are practice credits (SC). */
export type HowStep = {
  title: string;
  text: string;
  /** Which state-rail step is lit (0 = Draft ... 5 = Completed). */
  rail: number;
  amina: { available: number; held: number };
  brian: { available: number; held: number };
  note: string;
  tone: "ok" | "neutral" | "bad";
};

export const RAIL_LABELS = ["Draft", "Proposed", "Accepted", "Funded", "Delivered", "Completed"] as const;

export const HOW_STEPS: readonly HowStep[] = [
  {
    title: "Lock the funds",
    text: "Amina (the client) funds the contract. 45,000 SC moves from Available to Held. Nobody can spend it, not even Amina.",
    rail: 3,
    amina: { available: 55_000, held: 45_000 },
    brian: { available: 0, held: 0 },
    note: "Funds locked in escrow",
    tone: "ok",
  },
  {
    title: "Deliver the work",
    text: "Brian (the freelancer) uploads the file. Its SHA-256 fingerprint is recorded, so everyone can prove what was delivered.",
    rail: 4,
    amina: { available: 55_000, held: 45_000 },
    brian: { available: 0, held: 0 },
    note: "Fingerprint 9f2c…b8a1 recorded",
    tone: "neutral",
  },
  {
    title: "Approve and release",
    text: "Amina approves, or the 3-day review ends. A 2% fee (900 SC) is taken and 44,100 SC reaches Brian, exactly once.",
    rail: 5,
    amina: { available: 55_000, held: 0 },
    brian: { available: 44_100, held: 0 },
    note: "Released once · fee 900 SC",
    tone: "ok",
  },
  {
    title: "If you disagree",
    text: "Either side can raise a dispute. The funds freeze, both add evidence, and an independent arbitrator decides: release, refund or split.",
    rail: 4,
    amina: { available: 55_000, held: 45_000 },
    brian: { available: 0, held: 0 },
    note: "Frozen · arbitrator assigned",
    tone: "bad",
  },
];

export const HOW_VIDEO = {
  src: "/how-it-works/how-it-works.mp4",
  poster: "/how-it-works/poster.jpg",
  captions: "/how-it-works/captions.vtt",
} as const;
