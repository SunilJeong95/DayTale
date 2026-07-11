import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * apps/mobile/app.config.ts (plan §1.4, §3, §7).
 *
 * NOTE: This targets an EAS **Development Build**, not Expo Go — native
 * modules (Google/Apple/Kakao sign-in, expo-notifications push) require it
 * (plan §1.3, §7). `eas.json` (sibling file) defines the build profiles.
 *
 * `extra.eas.projectId` is left as an env-driven placeholder (EAS_PROJECT_ID)
 * — there is no real EAS project yet, so this stays undefined until `eas
 * init` fills it in; do not fabricate a fake id here.
 */

/**
 * Derives the `iosUrlScheme` that the
 * `@react-native-google-signin/google-signin` config plugin needs from a
 * standard Google iOS OAuth client id
 * (`<id>.apps.googleusercontent.com` -> `com.googleusercontent.apps.<id>`).
 * Returns undefined until GOOGLE_IOS_CLIENT_ID is set (.env.example).
 */
function googleIosUrlScheme(iosClientId: string | undefined): string | undefined {
  if (!iosClientId) return undefined;
  const suffix = ".apps.googleusercontent.com";
  if (!iosClientId.endsWith(suffix)) return undefined;
  const idPrefix = iosClientId.slice(0, -suffix.length);
  return `com.googleusercontent.apps.${idPrefix}`;
}

const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || undefined;
const googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID || undefined;
const resolvedGoogleIosUrlScheme = googleIosUrlScheme(googleIosClientId);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "DayTale",
  slug: "daytale",
  scheme: "daytale", // required for Kakao OAuth redirect + push deep links (plan §3)
  owner: process.env.EXPO_OWNER || undefined,
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.daytale.app",
    // Required for expo-apple-authentication (plan §3).
    usesAppleSignIn: true,
  },
  android: {
    package: "com.daytale.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    // TODO(WS-C/deploy): googleServicesFile for FCM push credentials (plan
    // §2.4, §7) — an actual google-services.json isn't available yet.
    // googleServicesFile: "./google-services.json",
  },
  plugins: [
    "expo-router",
    // expo-apple-authentication needs no plugin-level options; the
    // entitlement comes from ios.usesAppleSignIn above.
    "expo-apple-authentication",
    // The google-signin config plugin hard-validates `iosUrlScheme` and
    // throws (breaking `expo start`/`prebuild`/`build`/`lint` entirely) if
    // included with no options — so it must be omitted from the array
    // altogether until GOOGLE_IOS_CLIENT_ID is configured, not passed `{}`.
    ...(resolvedGoogleIosUrlScheme
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: resolvedGoogleIosUrlScheme },
          ] as [string, { iosUrlScheme: string }],
        ]
      : []),
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#ffffff",
      },
    ],
  ],
  extra: {
    // Set by `eas init`; required by getExpoPushTokenAsync() (plan §7) —
    // used in src/hooks/usePushToken.ts. Left undefined until a real EAS
    // project exists — do not fabricate a value here.
    eas: {
      projectId: process.env.EAS_PROJECT_ID || undefined,
    },
    // Read back at runtime by src/features/auth/google.ts via expo-constants
    // (GoogleSignin.configure needs these; app.config.ts runs in Node so it
    // can read the unprefixed .env.example vars directly, unlike bundled JS
    // which only sees EXPO_PUBLIC_* vars).
    googleWebClientId,
    googleIosClientId,
  },
  experiments: {
    typedRoutes: true,
  },
});
