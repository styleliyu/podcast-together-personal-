declare function jooxFactory(
  fileBody: Uint8Array,
  seed?: unknown,
): { decryptFile(data: Uint8Array): Uint8Array[] } | null;

export = jooxFactory;
