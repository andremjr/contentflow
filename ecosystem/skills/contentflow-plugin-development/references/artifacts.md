# Referência: arquivos e artifacts

Leia quando a capability receber `file`, `files`, `image`, `audio` ou `video`, ou quando produzir qualquer arquivo.

## Arquivos de entrada

O núcleo entrega referências `StoredFile` em staging autorizado. `StoredFile.url` não é um caminho arbitrário. Use:

```js
const inputPath = await services.resolveInputFile(request.inputs.source);
```

A permissão `filesystem:read` não libera outras pastas. Trate nome, extensão, MIME e metadados como não confiáveis; valide tamanho, tipo real e limites específicos do formato.

## Arquivos de saída

Obtenha o destino com:

```js
const outputPath = services.getOutputPath("resultado.txt");
```

Escreva apenas nessa raiz e devolva artifact com caminho relativo:

```js
return {
  status: "success",
  values: {
    result: {
      id: "result-file",
      name: "resultado.txt",
      mimeType: "text/plain",
      size: bytes,
      url: "artifact://result-file"
    }
  },
  artifacts: [{
    id: "result-file",
    name: "resultado.txt",
    mimeType: "text/plain",
    size: bytes,
    source: { kind: "path", path: "resultado.txt" }
  }]
};
```

`source.path` é relativo e não contém `..`. Não retorne bytes em base64. Não escreva diretamente no armazenamento definitivo.

## URLs remotas

Use URL remota somente quando a capability declarar `network`. A URL deve usar HTTPS, não conter credenciais e respeitar `networkHosts` quando fornecido. O núcleo realiza download mediado, valida DNS/SSRF/redirects/MIME/tamanho, calcula SHA-256, grava parcial e promove atomicamente. O plugin não decide sozinho o destino definitivo.

## Progressivos e limpeza

Em `pending`, `partialArtifacts` segue o mesmo contrato dos artifacts finais. O mesmo ID deve manter nome, MIME e tamanho; retries reutilizam IDs importados. Parciais inválidos ou não promovidos devem ser removidos pelo fluxo normal do núcleo.

## Records e proveniência

Ao produzir coleção de arquivos ou records, preserve ordem e inclua campos explícitos de proveniência quando necessários, como URL, provider, assetId, licença, autor, hash e data. Não use posição do array como relacionamento durável; use IDs de domínio.

Fonte: [protocol.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/protocol.md).
