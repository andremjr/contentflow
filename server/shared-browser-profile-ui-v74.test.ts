import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translate } from "../src/lib/app-preferences";

const pluginsSource = readFileSync(new URL("../src/routes/plugins.tsx", import.meta.url), "utf8");

test("package 7.4 only adds global-profile selection to the existing add-profile row", () => {
  assert.match(pluginsSource, /function PluginProfilesPanel/);
  assert.match(pluginsSource, /profile-inventory/);
  assert.match(pluginsSource, /placeholder="Nome do novo perfil"/);
  assert.match(pluginsSource, /t\("Usar perfil existente"\)/);
  assert.match(pluginsSource, /t\("Nenhum perfil existente disponível"\)/);
  assert.match(pluginsSource, /Adicionar perfil/);
  assert.match(pluginsSource, /result\.linked/);
  assert.match(pluginsSource, /result\.candidates/);
  assert.match(pluginsSource, /sharedSessionConsent: true/);
  assert.match(pluginsSource, /t\(\s*`Vincular \$\{profile\.name\}/);
  assert.doesNotMatch(pluginsSource, /Perfis disponíveis para vincular/);
  assert.doesNotMatch(pluginsSource, /Não há outros perfis globais disponíveis para vincular/);
  assert.doesNotMatch(pluginsSource, /setLoadError/);
});

test("package 7.4 translates only the select added to the existing profile form", () => {
  assert.equal(translate("Usar perfil existente", "en"), "Use existing profile");
  assert.equal(translate("Usar perfil existente", "es"), "Usar perfil existente");
  assert.equal(
    translate("Nenhum perfil existente disponível", "en"),
    "No existing profile available",
  );
  assert.equal(
    translate("Nenhum perfil existente disponível", "es"),
    "No hay perfiles existentes disponibles",
  );
  assert.equal(
    translate(
      "Vincular Perfil Família a Plugin Exemplo? Este plugin poderá usar a sessão local já existente neste perfil.",
      "en",
    ),
    "Link Perfil Família to Plugin Exemplo? This plugin will be able to use the local session already stored in this profile.",
  );
});

test("perfil em uso pode ser desvinculado com aviso localizado", () => {
  const warning =
    "Este perfil ainda está vinculado a processos. Ao removê-lo deste plugin, será necessário configurar outro perfil nesses processos antes de executar. O perfil global e a sessão local serão preservados.";
  assert.doesNotMatch(pluginsSource, /if \(profile\.usages\.length\) return/);
  assert.doesNotMatch(pluginsSource, /disabled=\{Boolean\(profile\.usages\.length\)\}/);
  assert.match(
    pluginsSource,
    /profile\.usages\.length\s*\?\s*"Este perfil ainda está vinculado a processos\./,
  );
  assert.equal(
    translate(warning, "en"),
    "This profile is still linked to processes. After removing it from this plugin, you will need to configure another profile in those processes before running them. The global profile and local session will be preserved.",
  );
  assert.equal(
    translate(warning, "es"),
    "Este perfil todavía está vinculado a procesos. Después de eliminarlo de este plugin, tendrás que configurar otro perfil en esos procesos antes de ejecutarlos. Se conservarán el perfil global y la sesión local.",
  );
});
