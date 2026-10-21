// The "Continue with Google" button, drawn to Google's sign-in branding guidelines
// (developers.google.com/identity/branding-guidelines, "Create a custom Sign in with Google Button"):
//  - the label is exactly "Continue with Google", one of the three texts Google recommends;
//  - the "G" is Google's own multicolour mark, unchanged (the four paths below), 20px, never recoloured;
//  - the button is light (white fill, 1px #747775 edge, #1F1F1F text) in the light looks and dark
//    (#131314 fill, 1px #8E918F edge, #E3E3E3 text) in Lamplight; src/styles.css draws both;
//  - the target is at least 44px high (48px on the grouped screens) and has the app's focus ring.
// The label is set in the app's own bundled font, not in Google Sans: the app loads no fonts from
// other companies. Nothing from Google is loaded to draw the button: the mark is inline SVG.
import { googleOpening } from "./googleSignIn";

export const googleLabel = "Continue with Google";

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function GoogleButton({
  busy,
  disabled,
  onPress,
}: {
  /** True while the browser is being sent to Google: the label says so and the button waits. */
  busy: boolean;
  /** True while something else is in progress (the email form), so two sign-ins never run at once. */
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="google-button"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      onClick={onPress}
    >
      <GoogleMark />
      <span>{busy ? googleOpening : googleLabel}</span>
    </button>
  );
}
