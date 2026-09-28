import test from "node:test";
import {
  assertBridgeNegotiationAndCancellation,
  assertCancellationStopsInvocation,
  assertGlobalProfileAndPrivateWorkspace,
  assertReadinessIsolation,
  createSharedBrowserProfileFixture,
} from "./test-support/shared-browser-profile-contract-v61";

test("pacote 6.1 reutiliza perfil global sem misturar o workspace privado", async () => {
  const fixture = await createSharedBrowserProfileFixture();
  try {
    await assertGlobalProfileAndPrivateWorkspace(fixture);
  } finally {
    await fixture.cleanup();
  }
});

test("pacote 6.1 mantém readiness isolado por plugin no mesmo perfil físico", async () => {
  const fixture = await createSharedBrowserProfileFixture();
  try {
    assertReadinessIsolation(fixture);
  } finally {
    await fixture.cleanup();
  }
});

test("pacote 6.1 cancela uma invocação sem deixar o worker ativo", async () => {
  const fixture = await createSharedBrowserProfileFixture();
  try {
    await assertCancellationStopsInvocation(fixture);
  } finally {
    await fixture.cleanup();
  }
});

test("pacote 6.1 fornece fixture reutilizável para negociação da Browser Bridge", async () => {
  const bridgeClientModule =
    "../ecosystem/plugins/reference/gemini-browser-studio/browser-bridge-client.mjs";
  const { attachContentFlowBridge } = await import(bridgeClientModule);
  await assertBridgeNegotiationAndCancellation(attachContentFlowBridge);
});
