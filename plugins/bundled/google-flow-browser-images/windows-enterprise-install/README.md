# Instalação administrativa no Chrome para Windows

Este pacote instala a extensão do plugin Google Flow por política de máquina em todos os perfis normais do Chrome. Ele não se aplica ao modo anônimo.

## Limitação do Chrome

Uma extensão local fora da Chrome Web Store só pode ser instalada dessa forma no Windows quando o dispositivo está:

- vinculado a um domínio Microsoft Active Directory;
- vinculado ao Microsoft Azure AD; ou
- inscrito no Chrome Enterprise Core.

Em um computador pessoal sem gerenciamento, o instalador encerra sem alterar o Registro. Gravar a chave manualmente não contorna a validação do Chrome.

## Instalar

1. Feche execuções do ContentFlow OS que estejam usando o Google Flow.
2. Execute `instalar.cmd`.
3. Confirme o UAC.
4. Abra `chrome://policy` e clique em **Recarregar políticas**, ou reinicie o Chrome.

O instalador empacota uma cópia imutável da pasta `extension`, preserva a chave `.pem` para manter o mesmo App ID nas atualizações, gera `artifacts/update.xml` e cria apenas uma entrada numérica em `HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist`. Entradas de outras extensões são preservadas.

Para um dispositivo inscrito no Chrome Enterprise Core que não exponha AD/Azure AD ao Windows, execute o PowerShell com `-EnterpriseCoreEnrolled` somente depois de confirmar a inscrição no console administrativo.

Use `-PackageOnly` para gerar CRX, chave e XML sem solicitar UAC e sem alterar políticas.

## Remover

Execute `desinstalar.cmd` e confirme o UAC. O script remove somente o valor exato que ele registrou. Os demais valores da política e os dados dos perfis não são apagados.

## Escopo atual

Este pacote é restrito à extensão oficial do plugin Google Flow. A extensão atual não é uma ponte universal: ela aceita apenas `https://labs.google/*` e os comandos desse plugin. Uma extensão comum a vários plugins exige um protocolo compartilhado, allowlist explícita de sites e adapters mantidos nos próprios plugins.
