import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// 저장 형식: scrypt$N$r$p$<salt base64url>$<hash base64url>
// 파라미터를 함께 저장해 두므로 나중에 강도를 올려도 기존 해시를 그대로 검증할 수 있다
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// N=2^15, r=8이면 128 * N * r = 32MiB가 필요해 기본 한도(32MiB)를 살짝 넘으므로 여유를 준다
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY });
  const { N, r, p } = PARAMS;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, N, r, p, saltText, hashText] = parts;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEMORY,
  });
  return timingSafeEqual(actual, expected);
}

// 없는 이메일로 로그인할 때도 해시 계산 시간을 똑같이 써서, 응답 시간으로 가입 여부를 알 수 없게 한다
let dummyHashPromise;
export async function verifyAgainstDummy(password) {
  dummyHashPromise ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummyHashPromise);
  return false;
}
