/**
 * Makes Clerk's sign-in, sign-up and account menu match TrustLock's navy and amber look.
 * Colours point at the tokens in globals.css, so the forms follow dark mode with the rest of the app.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--strong)",
    colorText: "var(--ink)",
    colorTextOnPrimaryBackground: "var(--on-strong)",
    colorInputText: "var(--ink)",
    colorTextSecondary: "var(--muted)",
    colorBackground: "var(--card)",
    colorInputBackground: "var(--surface)",
    colorDanger: "var(--red-700)",
    colorSuccess: "var(--green-700)",
    borderRadius: "8px",
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif', // the variable is set on <html> in layout.tsx
  },
  elements: {
    card: { boxShadow: "var(--shadow-card)", border: "0", borderRadius: "16px" },
    headerTitle: { fontWeight: 600 },
    formButtonPrimary: { minHeight: "44px", fontSize: "1rem" },
    formFieldInput: { minHeight: "44px", borderColor: "var(--outline)" },
    footerActionLink: { color: "var(--blue-700)" },
  },
};
