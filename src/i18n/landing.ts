import type { Lang } from "@/server/lang";

export type Example = { contract: string; title: string; body: string; alt: string };
export type Copy = {
  skip: string;
  navHow: string;
  navRoles: string;
  login: string;
  openDashboard: string;
  eyebrow: string;
  h1a: string;
  h1b: string;
  lead: string;
  regClient: string;
  regFreelancer: string;
  demoNote: string;
  exampleWord: string;
  previewTitle: string;
  examples: Example[];
  howTitle: string;
  steps: { title: string; body: string }[];
  tagline: string;
  rolesTitle: string;
  roles: { title: string; body: string }[];
  builtTitle: string;
  builtBody: string;
  talkTitle: string;
  talkBody: string;
  footer: string;
  privacy: string;
  terms: string;
  languageLabel: string;
  legalNote: string;
};

/**
 * Home page words in English and Kiswahili. Product screens, contract names and the legal pages stay in English.
 * The Kiswahili is a first draft and should be read by a native speaker before it is shown to the client.
 */
export const LANDING: Record<Lang, Copy> = {
  en: {
    skip: "Skip to main content",
    navHow: "How it works",
    navRoles: "Roles",
    login: "Log in",
    openDashboard: "Open dashboard",
    eyebrow: "Practice escrow for freelance jobs",
    h1a: "Pay when the work is delivered.",
    h1b: "Get paid when it is approved.",
    lead: "Payment stays locked until both sides confirm. If they disagree, an arbitrator decides. Every step lands in a log nobody can quietly edit.",
    regClient: "Register as client",
    regFreelancer: "Register as freelancer",
    demoNote: "Demo mode: choose a ready account. You do not need to sign up.",
    exampleWord: "Example",
    previewTitle: "See it in use",
    examples: [
      {
        contract: "Brand identity refresh",
        title: "Funds are held, not spent",
        body: "Once the client funds a contract, the money sits in escrow. Neither side can spend it until the work is approved.",
        alt: "A TrustLock contract page for a brand identity project. It shows KSh 45,000 held in escrow, the steps from draft to completed, and a timeline of what has happened.",
      },
      {
        contract: "Website copywriting",
        title: "One clear next step",
        body: "Each person sees what they need to do now. When work is delivered, the client reviews it. If they say nothing, approval happens by itself after the review period.",
        alt: "A TrustLock contract page for website copywriting. The work is delivered, and the client is shown a Review delivery button with the time left before automatic approval.",
      },
      {
        contract: "Logo animation",
        title: "When two sides disagree, a person decides",
        body: "Either side can raise a dispute and add evidence. An arbitrator reads both sides and decides how the held funds are split.",
        alt: "A TrustLock contract page for a logo animation that ended as resolved by split. The timeline shows the dispute raised by the client, evidence from both sides, and the arbitrator's ruling.",
      },
      {
        contract: "Audit log",
        title: "A record nobody can quietly edit",
        body: "Every action is added to an audit log. Each entry carries the fingerprint of the one before it, so a change anywhere breaks the chain.",
        alt: "The TrustLock audit log. A ledger reconciliation card shows the ledger is balanced, above a table of actions with the actor, result and fingerprint of each entry.",
      },
    ],
    howTitle: "How the money moves",
    steps: [
      { title: "Lock the funds", body: "The client funds the contract. The money moves from Available to Held, and nobody can spend it." },
      { title: "Deliver the work", body: "The freelancer uploads the file. Its SHA-256 fingerprint is recorded as proof of what was delivered." },
      { title: "Approve and release", body: "The client approves, or the review period ends. Payment is released exactly once." },
    ],
    tagline: "Held money cannot be spent by anyone. It is released once, when the client approves or the review period ends.",
    rolesTitle: "Who does what",
    roles: [
      { title: "Client", body: "Creates the contract, funds the escrow, reviews the delivery and approves the payment." },
      { title: "Freelancer", body: "Accepts the contract, does the work, uploads the delivery and receives the payment." },
      { title: "Arbitrator, admin and auditor", body: "Assigned by an administrator. They resolve disputes and verify the audit log." },
    ],
    builtTitle: "Built by",
    builtBody: "TrustLock is designed and built by Queen and Daniel Nab.",
    talkTitle: "Talk to us",
    talkBody: "A question, some feedback, or something that looks wrong? Send us an email.",
    footer: "Practice credits only. No real money is used. © 2026 TrustLock.",
    privacy: "Privacy policy",
    terms: "Terms of use",
    languageLabel: "Language",
    legalNote: "",
  },
  sw: {
    skip: "Ruka hadi maudhui makuu",
    navHow: "Mwongozo",
    navRoles: "Majukumu",
    login: "Ingia",
    openDashboard: "Fungua dashibodi",
    eyebrow: "Escrow ya mazoezi kwa kazi za kujitegemea",
    h1a: "Lipa kazi inapokabidhiwa.",
    h1b: "Lipwa inapokubaliwa.",
    lead: "Malipo hubaki yamefungwa hadi pande zote mbili zithibitishe. Wakipishana, msuluhishi huamua. Kila hatua huingia kwenye kumbukumbu ambayo hakuna anayeweza kuihariri kimyakimya.",
    regClient: "Jisajili kama mteja",
    regFreelancer: "Jisajili kama mfanyakazi huru",
    demoNote: "Hali ya maonyesho: chagua akaunti iliyo tayari. Huhitaji kujisajili.",
    exampleWord: "Mfano",
    previewTitle: "Tazama inavyotumika",
    examples: [
      {
        contract: "Brand identity refresh",
        title: "Pesa zinashikiliwa, hazitumiki",
        body: "Mteja akifadhili mkataba, pesa hukaa kwenye escrow. Hakuna upande unaoweza kuzitumia hadi kazi ikubaliwe.",
        alt: "Ukurasa wa mkataba wa TrustLock wa mradi wa utambulisho wa chapa. Unaonyesha KSh 45,000 zilizoshikiliwa kwenye escrow, hatua kutoka rasimu hadi kukamilika, na ratiba ya yaliyotokea.",
      },
      {
        contract: "Website copywriting",
        title: "Hatua moja iliyo wazi",
        body: "Kila mtu anaona anachopaswa kufanya sasa. Kazi ikiwasilishwa, mteja huipitia. Asiposema lolote, idhini hutolewa yenyewe baada ya kipindi cha mapitio.",
        alt: "Ukurasa wa mkataba wa TrustLock wa uandishi wa tovuti. Kazi imewasilishwa, na mteja anaonyeshwa kitufe cha kupitia kazi pamoja na muda uliobaki kabla ya idhini ya kiotomatiki.",
      },
      {
        contract: "Logo animation",
        title: "Pande mbili zikipishana, mtu huamua",
        body: "Upande wowote unaweza kuanzisha mgogoro na kuongeza ushahidi. Msuluhishi husoma pande zote mbili na kuamua jinsi pesa zilizoshikiliwa zitakavyogawanywa.",
        alt: "Ukurasa wa mkataba wa TrustLock wa uhuishaji wa nembo uliomalizika kwa kugawanywa. Ratiba inaonyesha mgogoro ulioanzishwa na mteja, ushahidi wa pande zote mbili, na uamuzi wa msuluhishi.",
      },
      {
        contract: "Audit log",
        title: "Kumbukumbu isiyohaririwa kimyakimya",
        body: "Kila kitendo huongezwa kwenye kumbukumbu ya ukaguzi. Kila ingizo hubeba alama ya lililotangulia, kwa hiyo mabadiliko popote huvunja mnyororo.",
        alt: "Kumbukumbu ya ukaguzi ya TrustLock. Kadi ya upatanisho wa leja inaonyesha leja imesawazika, juu ya jedwali la vitendo lenye mhusika, matokeo na alama ya kila ingizo.",
      },
    ],
    howTitle: "Jinsi pesa zinavyosogea",
    steps: [
      { title: "Funga fedha", body: "Mteja hufadhili mkataba. Pesa huhama kutoka Zilizopo kwenda Zilizoshikiliwa, na hakuna anayeweza kuzitumia." },
      { title: "Wasilisha kazi", body: "Mfanyakazi huru hupakia faili. Alama yake ya SHA-256 hurekodiwa kama ushahidi wa kilichowasilishwa." },
      { title: "Kubali na toa malipo", body: "Mteja hukubali, au kipindi cha mapitio kinaisha. Malipo hutolewa mara moja tu." },
    ],
    tagline: "Pesa zilizoshikiliwa hazitumiki na yeyote. Hutolewa mara moja, mteja anapokubali au kipindi cha mapitio kinapoisha.",
    rolesTitle: "Nani hufanya nini",
    roles: [
      { title: "Mteja", body: "Huunda mkataba, hufadhili escrow, hupitia kazi iliyowasilishwa na kuidhinisha malipo." },
      { title: "Mfanyakazi huru", body: "Hukubali mkataba, hufanya kazi, hupakia kazi iliyokamilika na hupokea malipo." },
      { title: "Msuluhishi, msimamizi na mkaguzi", body: "Hupangwa na msimamizi. Hutatua migogoro na kuthibitisha kumbukumbu ya ukaguzi." },
    ],
    builtTitle: "Imeundwa na",
    builtBody: "TrustLock imebuniwa na kujengwa na Queen na Daniel Nab.",
    talkTitle: "Zungumza nasi",
    talkBody: "Una swali, maoni, au kitu kinachoonekana kuwa na hitilafu? Tutumie barua pepe.",
    footer: "Salio za mazoezi tu. Hakuna pesa halisi inayotumika. © 2026 TrustLock.",
    privacy: "Sera ya faragha",
    terms: "Masharti ya matumizi",
    languageLabel: "Lugha",
    legalNote: "Kurasa hizi zinapatikana kwa Kiingereza.",
  },
};
