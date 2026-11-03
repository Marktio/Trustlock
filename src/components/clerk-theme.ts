/**
 * Makes Clerk's sign-in, sign-up and account menu match TrustLock's navy and amber look.
 * Hex values mirror the tokens in globals.css (Clerk cannot read CSS variables).
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#111b33",
    colorText: "#171c2e",
    colorTextSecondary: "#4d556a",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorDanger: "#9f2828",
    colorSuccess: "#15664a",
    borderRadius: "8px",
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif', // the variable is set on <html> in layout.tsx
  },
  elements: {
    card: { boxShadow: "0 1px 2px rgb(17 27 51 / 0.06), 0 24px 48px -24px rgb(17 27 51 / 0.28)", border: "0", borderRadius: "16px" },
    headerTitle: { fontWeight: 600 },
    formButtonPrimary: { minHeight: "44px", fontSize: "1rem" },
    formFieldInput: { minHeight: "44px", borderColor: "#6b7389" },
    footerActionLink: { color: "#234c98" },
  },
};
