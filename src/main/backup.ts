import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// Backup cifrato con passphrase: AES-256-GCM, chiave derivata con scrypt.
// Il file è un JSON "envelope" leggibile, ma il payload è cifrato e autenticato.

const MAGIC = 'aetherssh-backup'
const VERSION = 1
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

interface Envelope {
  magic: string
  version: number
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, SCRYPT_PARAMS)
}

export function encryptBundle(payload: unknown, passphrase: string): string {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const envelope: Envelope = {
    magic: MAGIC,
    version: VERSION,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: enc.toString('base64')
  }
  return JSON.stringify(envelope, null, 2)
}

export function decryptBundle<T>(fileContent: string, passphrase: string): T {
  let env: Envelope
  try {
    env = JSON.parse(fileContent)
  } catch {
    throw new Error('Il file non è un backup valido di AetherSSH.')
  }
  if (env?.magic !== MAGIC) throw new Error('Il file non è un backup valido di AetherSSH.')
  const salt = Buffer.from(env.salt, 'base64')
  const iv = Buffer.from(env.iv, 'base64')
  const tag = Buffer.from(env.tag, 'base64')
  const data = Buffer.from(env.data, 'base64')
  const key = deriveKey(passphrase, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  try {
    const dec = Buffer.concat([decipher.update(data), decipher.final()])
    return JSON.parse(dec.toString('utf8')) as T
  } catch {
    // GCM fallisce l'autenticazione se la passphrase è errata o il file è corrotto.
    throw new Error('Passphrase errata o file danneggiato.')
  }
}
