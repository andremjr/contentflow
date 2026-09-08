# MAI Playground Browser

Plugin de referência para automação de navegador do **Microsoft AI Playground** (`https://playground.microsoft.ai/chat`), com foco especial em **Text-to-Speech (TTS)** com `mai-voice-2` e `mai-voice-2-flash`.

Versão **1.0.0** para ContentFlow Plugin API v1.

---

## 1. Visão Geral

Este plugin opera a interface web do Microsoft AI Playground através de uma instância dedicada e isolada do Google Chrome, utilizando a extensão compartilhada **ContentFlow Browser Bridge** para envio de comandos via DOM e CDP (_Chrome DevTools Protocol_).

Ele não utiliza APIs oficiais pagas nem requer chaves de API secretas. A autenticação é realizada diretamente pelo criador na janela dedicada do Chrome através do recurso **Salvar perfil**.

---

## 2. Capabilities

### `generate-voice-in-browser` (TTS / Narração)

- **Processo Universal:** `narration` ("Narração e Áudio").
- **Bloco:** `CRIAR` com Operador `IA`.
- **Entrada:** `text` (Texto da narração a ser falado).
- **Saídas:**
  - `audio`: Arquivo de áudio sintetizado, renderizado via reprodutor de áudio nativo (`audio-player`).
  - `transcript`: Transcrição do texto falado.
- **Modelos suportados:**
  - `mai-voice-2` (padrão)
  - `mai-voice-2-flash` (alta velocidade)
- **Vozes Copilot disponíveis:**
  - `alder`, `acacia`, `birch`, `elm`, `grove`, `moss`, `oak`, `rain`, `sage`, `teak`, `wave`.
- **Tons e Estilos:**
  - `neutral`, `narration`, `cheerful`, `adventurous`, `news`, `reflection`, `whisper`, etc.

### `generate-text-in-browser` (Geração de Texto / Raciocínio)

- **Processos Universais:** Todos os 8 processos de conteúdo.
- **Bloco:** `CRIAR` com Operador `IA`.
- **Entrada:** `content` (Contexto do bloco) e anexos opcionais.
- **Saídas:** `result` (Texto gerado) e `parts` (Respostas parciais).
- **Modelo:** `mai-thinking-1-latest`.

---

## 3. Isolamento e Perfis Dedicados

Cada canal ou projeto pode utilizar um alias de perfil dedicado configurado no campo `accountProfile` (padrão: `default`).
Cada perfil armazena seus dados em uma pasta isolada e opera em uma porta CDP própria calculada a partir da porta base `9944`.

### Fluxo de Preparação da Conta ("Salvar perfil")

1. No construtor de Métodos do ContentFlow, adicione um bloco com este plugin.
2. Clique no botão **Salvar perfil** (ou **Conectar conta**).
3. A janela do Chrome dedicado será aberta na interface do Microsoft AI Playground.
4. Faça login com sua conta Microsoft ou feche avisos e termos iniciais até que a área de criação/chat esteja disponível.
5. O plugin registrará a sessão como pronta e fechará o navegador.
6. A partir desse momento, as execuções do Método ocorrerão em background de forma automatizada.

---

## 4. Instalação e Requisitos

1. No ContentFlow, abra **Plugins** → **Instalar plugin** → **Usar pasta ao vivo**.
2. Selecione a pasta `ecosystem/plugins/reference/mai-playground-browser`.
3. Certifique-se de que a extensão `ecosystem/browser-bridge` esteja carregada no perfil do Chrome via `chrome://extensions` (**Carregar sem compactação** com o _Modo do desenvolvedor_ ativo).
4. Revise e conceda as permissões solicitadas (`network`, `filesystem:read`, `filesystem:write`, `process`).

---

## 5. Validação Automatizada

Para rodar os testes da suíte interna e do verificador de conformidade do ContentFlow:

```powershell
node --test ./ecosystem/plugins/reference/mai-playground-browser/test.mjs
npm run plugin:kit -- check ./ecosystem/plugins/reference/mai-playground-browser
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/mai-playground-browser
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/mai-playground-browser
```
