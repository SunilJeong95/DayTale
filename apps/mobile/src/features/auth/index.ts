/**
 * apps/mobile/src/features/auth/index.ts — OWNED BY WS-B (Auth & shell).
 *
 * Barrel export for the per-provider sign-in implementations consumed by
 * src/hooks/useAuth.ts (plan §3).
 */
export { signInWithApple } from "./apple";
export { signInWithGoogle } from "./google";
export { signInWithKakao } from "./kakao";
