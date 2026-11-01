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
    borderRadius: "10px",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  elements: {
    card: { boxShadow: "0 1px 2px rgb(17 27 51 / 0.08)", border: "1px solid #d3d8e4" },
    headerTitle: { fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', fontWeight: 400 },
    formButtonPrimary: { minHeight: "44px", fontSize: "1rem" },
    formFieldInput: { minHeight: "44px", borderColor: "#6b7389" },
    footerActionLink: { color: "#234c98" },
  },
};
