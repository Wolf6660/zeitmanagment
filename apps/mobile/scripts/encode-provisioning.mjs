import CryptoJS from "crypto-js";

const QR_PREFIX = "ZMOBILE1:";
const PROVISIONING_SECRET = "zm-mobile-bootstrap-v1";

function usage() {
  console.log("Nutzung:");
  console.log("npm run qr:encode -w apps/mobile -- --api https://example.de --login max --password geheim");
}

function parseArg(flag) {
  const idx = process.argv.findIndex((x) => x === flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

const apiBaseUrl = parseArg("--api");
const loginName = parseArg("--login");
const password = parseArg("--password");

if (!apiBaseUrl || !/^https?:\/\//i.test(apiBaseUrl)) {
  usage();
  console.error("Fehler: --api fehlt oder ist ungueltig.");
  process.exit(1);
}

if ((loginName && !password) || (!loginName && password)) {
  usage();
  console.error("Fehler: --login und --password nur gemeinsam verwenden.");
  process.exit(1);
}

const payload = {
  apiBaseUrl: apiBaseUrl.replace(/\/$/, "")
};
if (loginName && password) {
  payload.loginName = loginName;
  payload.password = password;
}

const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), PROVISIONING_SECRET).toString();
const qrContent = `${QR_PREFIX}${encrypted}`;

console.log("QR-Inhalt:");
console.log(qrContent);
