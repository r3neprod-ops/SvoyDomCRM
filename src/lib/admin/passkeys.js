import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { getBaseUrl } from './oauth';

export function getWebAuthnConfig(request) {
  const baseUrl = getBaseUrl(request);
  const origin = process.env.WEBAUTHN_ORIGIN || new URL(baseUrl).origin;
  return {
    rpName: process.env.WEBAUTHN_RP_NAME || 'CRM24',
    rpID: process.env.WEBAUTHN_RP_ID || new URL(origin).hostname,
    origin,
  };
}

export function credentialPublicKeyToString(publicKey) {
  return Buffer.from(publicKey).toString('base64url');
}

export function credentialPublicKeyFromString(value) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

export function parseTransports(value) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function makeRegistrationOptions({ request, user, existingCredentials = [] }) {
  const { rpName, rpID } = getWebAuthnConfig(request);
  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(String(user.id)),
    userName: user.username,
    userDisplayName: user.name || user.username,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credential_id,
      transports: parseTransports(credential.transports),
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
  });
}

export async function verifyPasskeyRegistration({ request, response, expectedChallenge }) {
  const { origin, rpID } = getWebAuthnConfig(request);
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
}

export async function makeAuthenticationOptions(request) {
  const { rpID } = getWebAuthnConfig(request);
  return generateAuthenticationOptions({
    rpID,
    timeout: 60000,
    userVerification: 'required',
  });
}

export async function verifyPasskeyAuthentication({ request, response, expectedChallenge, credential }) {
  const { origin, rpID } = getWebAuthnConfig(request);
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential,
    requireUserVerification: true,
  });
}
