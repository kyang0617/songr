// Spotify Authorization Code flow with PKCE, entirely in the browser.
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

import { SessionExpiredError } from "../../lib/errors";
import { readJSON, remove, safeSession, writeJSON } from "../../lib/storage";

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const SCOPES = "playlist-read-private playlist-read-collaborative";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const TOKEN_KEY = "songr.spotify.token";
const PKCE_KEY = "songr.spotify.pkce";

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export const isConfigured = () => Boolean(CLIENT_ID);
export const isLoggedIn = () => readJSON<StoredToken | null>(TOKEN_KEY, null) !== null;

export function redirectUri(): string {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI || `${window.location.origin}/callback`;
}

export async function login(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  writeJSON(PKCE_KEY, { verifier, state }, safeSession());

  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: "S256",
    code_challenge: await sha256Base64Url(verifier),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

// React StrictMode runs effects twice in dev; an auth code can only be
// exchanged once, so share the in-flight promise.
let callbackPromise: Promise<void> | null = null;

/** Exchange ?code= for tokens. Call on the /callback route. */
export function handleCallback(): Promise<void> {
  callbackPromise ??= exchangeCode();
  return callbackPromise;
}

async function exchangeCode(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (error) {
    throw new Error(error === "access_denied" ? "Spotify login was cancelled." : `Spotify login failed: ${error}`);
  }

  const pkce = readJSON<{ verifier: string; state: string } | null>(PKCE_KEY, null, safeSession());
  remove(PKCE_KEY, safeSession());
  const code = params.get("code");
  if (!code || !pkce || params.get("state") !== pkce.state) {
    throw new Error("Spotify login failed (state mismatch). Please try again.");
  }

  await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID!,
    code_verifier: pkce.verifier,
  });
}

export function logout(): void {
  remove(TOKEN_KEY);
}

let refreshPromise: Promise<void> | null = null;

/** A valid access token, refreshing it first if it's about to expire. */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const token = readJSON<StoredToken | null>(TOKEN_KEY, null);
  if (!token) throw new SessionExpiredError("Please log in with Spotify.");

  if (forceRefresh || Date.now() > token.expiresAt - 60_000) {
    // Several requests may notice expiry at once; refresh only once.
    refreshPromise ??= requestToken({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: CLIENT_ID!,
    }).finally(() => (refreshPromise = null));
    try {
      await refreshPromise;
    } catch {
      logout();
      throw new SessionExpiredError();
    }
  }
  return readJSON<StoredToken>(TOKEN_KEY, token).accessToken;
}

async function requestToken(body: Record<string, string>): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Spotify login failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  const previous = readJSON<StoredToken | null>(TOKEN_KEY, null);
  writeJSON(TOKEN_KEY, {
    accessToken: data.access_token,
    // Spotify may or may not rotate the refresh token.
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  } satisfies StoredToken);
}

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
