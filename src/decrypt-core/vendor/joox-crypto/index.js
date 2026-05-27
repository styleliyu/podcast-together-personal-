import DecryptorV4 from "./crypto/DecryptorV4";

function jooxFactory(fileBody, seed) {
  if (DecryptorV4.detect(fileBody)) {
    return new DecryptorV4(seed);
  }

  return null;
}

export default jooxFactory;
