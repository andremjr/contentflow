import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_LANGUAGE_CODES,
  getChannelLanguageName,
  getChannelLanguageOptions,
} from "./channel-languages";

test("offers a broad, unique list while preserving legacy channel language codes", () => {
  assert.ok(CHANNEL_LANGUAGE_CODES.length >= 40);
  assert.equal(new Set(CHANNEL_LANGUAGE_CODES).size, CHANNEL_LANGUAGE_CODES.length);
  for (const legacyCode of ["PT-BR", "EN", "ES", "FR", "DE"]) {
    assert.ok(
      CHANNEL_LANGUAGE_CODES.includes(legacyCode as (typeof CHANNEL_LANGUAGE_CODES)[number]),
    );
  }
  for (const regionalCode of ["EN-US", "EN-AU", "ES-ES", "ES-MX"]) {
    assert.ok(
      CHANNEL_LANGUAGE_CODES.includes(regionalCode as (typeof CHANNEL_LANGUAGE_CODES)[number]),
    );
  }
});

test("localizes channel language names using the application language", () => {
  assert.match(getChannelLanguageName("EN-US", "pt-BR"), /inglês/i);
  assert.match(getChannelLanguageName("ES-MX", "pt-BR"), /espanhol/i);
  assert.match(getChannelLanguageName("PT-BR", "en"), /Portuguese/i);
  assert.match(getChannelLanguageName("EN-AU", "es"), /inglés/i);
  for (const appLanguage of ["pt-BR", "en", "es"] as const) {
    for (const code of CHANNEL_LANGUAGE_CODES) {
      const name = getChannelLanguageName(code, appLanguage);
      assert.equal(name.charAt(0), name.charAt(0).toLocaleUpperCase(appLanguage));
    }
  }
});

test("sorts channel languages alphabetically using the application language", () => {
  for (const appLanguage of ["pt-BR", "en", "es"] as const) {
    const options = getChannelLanguageOptions(appLanguage);
    const collator = new Intl.Collator(appLanguage, { sensitivity: "base" });
    const expected = [...options].sort(
      (left, right) =>
        collator.compare(left.name, right.name) || left.code.localeCompare(right.code),
    );
    assert.deepEqual(options, expected);
  }
});
