// Face ID / fingerprint "app lock" for mobile and tablet — re-gates an already-valid session
// after a password login, it does not replace password login itself. The actual auth token
// already lives in localStorage and is already valid; biometrics here only decide whether the
// UI reveals it on THIS device, using the browser's own WebAuthn platform authenticator (Face
// ID / Touch ID / Windows Hello / Android fingerprint). There is deliberately no server round
// trip for the unlock itself — the platform authenticator already enforces the biometric check
// before it will ever return a signed assertion, and the token it's gating never leaves the
// device either way, so a local-only check is exactly as strong as this needs to be. Per-user
// and per-device: the credential is stored in this browser's localStorage, keyed by user id, so
// it has to be set up again on each new device/browser.

const faceLockKey = (userId) => `agw_facelock_${userId}`;
const promptDismissedKey = (userId) => `agw_facelock_prompt_dismissed_${userId}`;

const toB64Url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64Url = (str) => {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

// Matches the app's own existing mobile/tablet breakpoint (see .agw-sidebar's @media rule) —
// desktop users already have a password manager autofilling this, so the prompt stays mobile-only.
export function isMobileOrTablet() {
  try { return window.matchMedia("(max-width: 860px)").matches; } catch { return false; }
}

export async function isBiometricAvailable() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export function getFaceLockSetting(userId) {
  try { return JSON.parse(localStorage.getItem(faceLockKey(userId)) || "null"); } catch { return null; }
}

export function isFaceLockEnabled(userId) {
  return !!getFaceLockSetting(userId)?.credentialId;
}

export async function enableFaceLock(userId, userName) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "SMART CRM" },
      user: { id: new TextEncoder().encode(String(userId)), name: userName || String(userId), displayName: userName || String(userId) },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  });
  if (!cred) throw new Error("Couldn't set up Face ID / fingerprint unlock on this device.");
  localStorage.setItem(faceLockKey(userId), JSON.stringify({ credentialId: toB64Url(cred.rawId) }));
}

export function disableFaceLock(userId) {
  localStorage.removeItem(faceLockKey(userId));
}

export async function verifyFaceLock(userId) {
  const setting = getFaceLockSetting(userId);
  if (!setting?.credentialId) throw new Error("Face ID / fingerprint unlock isn't set up on this device.");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: fromB64Url(setting.credentialId), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!assertion) throw new Error("Face ID / fingerprint unlock failed.");
}

export function dismissFaceLockPrompt(userId) {
  try { localStorage.setItem(promptDismissedKey(userId), "1"); } catch { /* storage unavailable: prompt just reappears next time */ }
}
export function faceLockPromptDismissed(userId) {
  try { return localStorage.getItem(promptDismissedKey(userId)) === "1"; } catch { return false; }
}
