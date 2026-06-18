import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';

// Safe base64 decode — always returns Uint8Array
const b64decode = (str) => {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Safe base64 encode from Uint8Array
const b64encode = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Safe UTF8 encode — always returns Uint8Array
const utf8encode = (str) => {
  const encoded = unescape(encodeURIComponent(str));
  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) {
    bytes[i] = encoded.charCodeAt(i);
  }
  return bytes;
};

// Safe UTF8 decode from Uint8Array
const utf8decode = (bytes) => {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(str));
};

const setupPRNG = async () => {
  const raw = await ExpoCrypto.getRandomBytesAsync(256);
  const uint8 = new Uint8Array(raw);
  let offset = 0;
  nacl.setPRNG((x, n) => {
    for (let i = 0; i < n; i++) {
      x[i] = uint8[(offset + i) % 256];
    }
    offset = (offset + n) % 256;
  });
};

export const generateKeyPair = async () => {
  await setupPRNG();
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: b64encode(keyPair.publicKey),
    privateKey: b64encode(keyPair.secretKey),
  };
};

export const savePrivateKey = async (privateKey, username) => {
  await SecureStore.setItemAsync(`xeta_private_key_${username}`, privateKey);
};

export const getPrivateKey = async (username) => {
  return await SecureStore.getItemAsync(`xeta_private_key_${username}`);
};

export const encryptMessage = async (plaintext, recipientPublicKeyB64, senderPrivateKeyB64) => {
  await setupPRNG();

  const recipientPublicKey = b64decode(recipientPublicKeyB64);
  const senderPrivateKey = b64decode(senderPrivateKeyB64);
  const messageBytes = utf8encode(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );

  return {
    ciphertext: b64encode(encrypted),
    nonce: b64encode(nonce),
  };
};

export const decryptMessage = (ciphertextB64, nonceB64, senderPublicKeyB64, recipientPrivateKeyB64) => {
  try {
    const ciphertext = b64decode(ciphertextB64);
    const nonce = b64decode(nonceB64);
    const senderPublicKey = b64decode(senderPublicKeyB64);
    const recipientPrivateKey = b64decode(recipientPrivateKeyB64);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      senderPublicKey,
      recipientPrivateKey
    );

    if (!decrypted) return '[could not decrypt]';
    return utf8decode(decrypted);
  } catch (e) {
    return '[decryption error: ' + e.message + ']';
  }
};
