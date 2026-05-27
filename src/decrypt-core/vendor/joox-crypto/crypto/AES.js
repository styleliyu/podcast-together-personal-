import pbkdf2 from "crypto-js/pbkdf2";
import "crypto-js/hmac-sha1";

import AES from "crypto-js/aes";
import PKCS7 from "crypto-js/pad-pkcs7";
import ModeECB from "crypto-js/mode-ecb";

import C from "crypto-js/core";

import { Uint8ArrayEncoder } from "./utils";

const KEY_SIZE = 16;

const defaultSalt = new Uint8Array([
  0xa4, 0x0b, 0xc8, 0x34, 0xd6, 0x95, 0xf3, 0x13, 0x23, 0x23, 0x43, 0x23, 0x54,
  0x63, 0x83, 0xf3,
]);

/**
 * Derive AES Secret key using uuid2
 * @param {string} uuid2 User's uuid v2 (generated on app first startup)
 * @param {Uint8Array} [salt = null] Salt used to generate aes key.
 */
function getAESSecretKey(uuid2, salt = null) {
  const key = pbkdf2(uuid2, Uint8ArrayEncoder.parse(salt || defaultSalt), {
    iterations: 1000,
    hasher: C.algo.SHA1,
  });
  return Uint8ArrayEncoder.stringify(key).slice(0, KEY_SIZE);
}

/**
 *
 * @param {Uint8Array} key
 * @param {Uint8Array} block
 * @returns {Uint8Array} decrypted data
 */
function decryptAESBlock(key, block) {
  const result = AES.decrypt(
    {
      ciphertext: Uint8ArrayEncoder.parse(block),
    },
    Uint8ArrayEncoder.parse(key),
    {
      mode: ModeECB,
      padding: PKCS7,
    }
  );
  return Uint8ArrayEncoder.stringify(result);
}

export {
  getAESSecretKey,
  decryptAESBlock,
};
