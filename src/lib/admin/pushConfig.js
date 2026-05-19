export function getVapidPublicKey() {
  return (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
}

export function getVapidPrivateKey() {
  return (process.env.VAPID_PRIVATE_KEY || '').trim();
}

export function getVapidSubject() {
  return (process.env.VAPID_SUBJECT || 'mailto:r3neprod@gmail.com').trim();
}

export function getVapidKeys() {
  return {
    publicKey: getVapidPublicKey(),
    privateKey: getVapidPrivateKey(),
    subject: getVapidSubject(),
  };
}

export function getVapidDiagnostics() {
  const { publicKey, privateKey, subject } = getVapidKeys();
  return {
    publicKey,
    privateKey,
    subject,
    ok: Boolean(publicKey && privateKey && subject),
    publicKeyLength: publicKey.length,
    privateKeyLength: privateKey.length,
  };
}
