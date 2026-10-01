import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyMethods, type Channel } from "./domain";
import {
  applyUpgradePlan,
  loadUpgradePlan,
  UpgradeApiError,
  channelNeedsUpgrade,
  methodNeedsUpgrade,
  preserveChannelForPresentation,
} from "./user-data-upgrade";
import { upgradeTranslations } from "./upgrade-translations";
import { refreshState, setChannelMethods, startProcessExecution, updateChannel } from "./store";

const legacyChannel = {
  id: "legacy-channel",
  name: "Meu Canal",
  methods: {
    ...createEmptyMethods(),
    theme: {
      contractVersion: 2,
      name: "Meu Método",
      processType: "theme",
      blocks: [
        {
          id: "old-block",
          type: "CRIAR",
          operator: "Humano",
          parameters: [],
          order: 0,
          outputs: [{ id: "old-output", key: "theme", label: "Tema", type: "textarea" }],
        },
      ],
    },
  },
} as unknown as Channel;

test("legacy and partially incompatible channels remain raw and visible; valid drafts remain valid", () => {
  const before = JSON.stringify(legacyChannel);
  assert.equal(preserveChannelForPresentation(legacyChannel), legacyChannel);
  assert.equal(JSON.stringify(legacyChannel), before);
  assert.equal(channelNeedsUpgrade(legacyChannel), true);
  assert.equal(methodNeedsUpgrade({ ...legacyChannel.methods.theme, contractVersion: 3 }), true);
  assert.equal(channelNeedsUpgrade({ ...legacyChannel, methods: createEmptyMethods() }), false);
});

test("all upgrade UI and API error messages have PT/EN/ES translations", () => {
  const keys = Object.keys(upgradeTranslations["pt-BR"]).sort();
  for (const language of ["pt-BR", "en", "es"] as const) {
    assert.deepEqual(Object.keys(upgradeTranslations[language]).sort(), keys);
    assert.ok(Object.values(upgradeTranslations[language]).every((value) => value.trim()));
  }
  for (const key of keys) {
    const typedKey = key as keyof typeof upgradeTranslations.en;
    assert.notEqual(upgradeTranslations.en[typedKey], upgradeTranslations["pt-BR"][typedKey]);
    if (key !== "diagnostics")
      assert.notEqual(upgradeTranslations.es[typedKey], upgradeTranslations["pt-BR"][typedKey]);
  }
});

test("plan is read-only; apply explicitly sends the reviewed plan ID and backup authorization", async () => {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ planId: "reviewed-plan", applied: true, backupPath: "backup.sqlite" });
  };
  try {
    await loadUpgradePlan();
    await applyUpgradePlan("reviewed-plan");
    assert.equal(calls[0].init?.method, undefined);
    assert.equal(calls[1].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
      planId: "reviewed-plan",
      confirmBackup: true,
    });
    globalThis.fetch = async () =>
      Response.json(
        { code: "POST_VALIDATION_FAILED", backupPath: "safe-backup.sqlite" },
        { status: 409 },
      );
    await assert.rejects(
      applyUpgradePlan("stale"),
      (error: unknown) =>
        error instanceof UpgradeApiError &&
        error.code === "POST_VALIDATION_FAILED" &&
        error.backupPath === "safe-backup.sqlite",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("first state loads legacy channels; incompatible strategy edits and execution send no effects", async () => {
  const original = globalThis.fetch;
  const effects: string[] = [];
  globalThis.fetch = async (input, init) => {
    if (init?.method) effects.push(`${init.method} ${input}`);
    return Response.json({
      revision: 100000,
      channels: [legacyChannel],
      projects: [],
      executions: [],
      orchestrators: [],
      libraryItems: [],
      libraryCollections: [],
      upgrade: { required: true, applying: false },
    });
  };
  try {
    assert.equal(await refreshState(true), true);
    await assert.rejects(
      setChannelMethods(legacyChannel.id, { title: createEmptyMethods().title }),
    );
    await assert.rejects(startProcessExecution("legacy-project", "theme"));
    await assert.rejects(updateChannel({ ...legacyChannel, methods: createEmptyMethods() }));
    assert.deepEqual(effects, []);
    await updateChannel({ ...legacyChannel, name: "Organizado" });
    assert.deepEqual(effects, ["PUT /api/channels/legacy-channel"]);
  } finally {
    globalThis.fetch = original;
  }
});
