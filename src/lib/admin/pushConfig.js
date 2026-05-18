export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}

export function getVapidPrivateKey() {
  return process.env.VAPID_PRIVATE_KEY || '';
}

export function getVapidKeys() {
  return {
    publicKey: getVapidPublicKey(),
    privateKey: getVapidPrivateKey(),
  };
}
