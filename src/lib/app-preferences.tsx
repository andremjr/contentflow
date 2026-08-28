/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AppTheme = "light" | "dark";
export type AppLanguage = "pt-BR" | "en" | "es";

export type AppPreferences = {
  theme: AppTheme;
  language: AppLanguage;
};

type PreferencesContextValue = AppPreferences & {
  ready: boolean;
  setTheme: (theme: AppTheme) => void;
  setLanguage: (language: AppLanguage) => void;
  t: (source: string) => string;
};

const DEFAULT_PREFERENCES: AppPreferences = { theme: "dark", language: "pt-BR" };

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

type Translation = [english: string, spanish: string];

const PHRASES: Record<string, Translation> = {
  "A ação ainda não pode ser concluída": [
    "This action cannot be completed yet",
    "Esta acción aún no puede completarse",
  ],
  "A cópia ficará independente do método original.": [
    "The copy will remain independent from the original method.",
    "La copia será independiente del método original.",
  ],
  "A página que você procura não existe ou foi movida.": [
    "The page you're looking for doesn't exist or has been moved.",
    "La página que buscas no existe o fue movida.",
  ],
  "A saída compatível mais recente é conectada automaticamente.": [
    "The latest compatible output is connected automatically.",
    "La salida compatible más reciente se conecta automáticamente.",
  ],
  "A tarefa sai daqui somente depois que o operador conclui a ação.": [
    "The task leaves this list only after the operator completes the action.",
    "La tarea sale de esta lista solo cuando el operador completa la acción.",
  ],
  "Abrir canal": ["Open channel", "Abrir canal"],
  "Abrir página em uma nova aba": ["Open page in a new tab", "Abrir página en una pestaña nueva"],
  Abrir: ["Open", "Abrir"],
  "Abra uma coleção para consultar ou administrar seus itens.": [
    "Open a collection to browse or manage its items.",
    "Abre una colección para consultar o administrar sus elementos.",
  ],
  Bloco: ["Block", "Bloque"],
  bloco: ["block", "bloque"],
  blocos: ["blocks", "bloques"],
  coleção: ["collection", "colección"],
  coleções: ["collections", "colecciones"],
  de: ["of", "de"],
  e: ["and", "y"],
  inscritos: ["subscribers", "suscriptores"],
  item: ["item", "elemento"],
  itens: ["items", "elementos"],
  permissão: ["permission", "permiso"],
  permissões: ["permissions", "permisos"],
  projeto: ["project", "proyecto"],
  projetos: ["projects", "proyectos"],
  "Voltar para": ["Back to", "Volver a"],
  "Organize as ações na ordem em que devem acontecer em todos os vídeos deste canal.": [
    "Arrange the actions in the order they should happen in every video on this channel.",
    "Organiza las acciones en el orden en que deben ocurrir en todos los videos de este canal.",
  ],
  "Usar da biblioteca": ["Use from library", "Usar de la biblioteca"],
  "Usar sugestão": ["Use suggestion", "Usar sugerencia"],
  "O que esta ação recebe. A saída compatível mais recente é conectada automaticamente.": [
    "What this action receives. The latest compatible output is connected automatically.",
    "Lo que recibe esta acción. La salida compatible más reciente se conecta automáticamente.",
  ],
  "O que esta ação deve entregar para o método continuar.": [
    "What this action must deliver for the method to continue.",
    "Lo que esta acción debe entregar para que el método continúe.",
  ],
  "Informe a chave para validar a conexão e carregar os modelos disponíveis em tempo real. Ela permanece apenas na memória enquanto o aplicativo estiver aberto.":
    [
      "Enter the key to validate the connection and load available models in real time. It remains in memory only while the app is open.",
      "Introduce la clave para validar la conexión y cargar los modelos disponibles en tiempo real. Solo permanece en memoria mientras la aplicación está abierta.",
    ],
  "Plugins ficam separados do núcleo. Todos usam “Instalar uma cópia” ou “Usar pasta ao vivo” para o ContentFlow validar o manifesto, independentemente do autor.":
    [
      "Plugins are kept outside the core. All of them use “Install a copy” or “Use live folder” so ContentFlow can validate the manifest, regardless of the author.",
      "Los plugins están separados del núcleo. Todos usan “Instalar una copia” o “Usar carpeta activa” para que ContentFlow valide el manifiesto, independientemente del autor.",
    ],
  Progresso: ["Progress", "Progreso"],
  Não: ["No", "No"],
  "Sem prazo": ["No deadline", "Sin fecha límite"],
  ativos: ["active", "activos"],
  "@ do canal *": ["Channel @ *", "@ del canal *"],
  "Você também pode colar a URL completa do canal.": [
    "You can also paste the full channel URL.",
    "También puedes pegar la URL completa del canal.",
  ],
  "Informe o @. Nome, inscritos e imagens serão buscados automaticamente.": [
    "Enter the @. Name, subscriber count, and images will be loaded automatically.",
    "Introduce el @. El nombre, los suscriptores y las imágenes se cargarán automáticamente.",
  ],
  "Cor de destaque": ["Accent color", "Color de acento"],
  "1x / semana": ["Once a week", "Una vez por semana"],
  "2x / semana": ["Twice a week", "Dos veces por semana"],
  "3x / semana": ["Three times a week", "Tres veces por semana"],
  Close: ["Close", "Cerrar"],
  "Ação concluída": ["Action completed", "Acción completada"],
  "Ações do canal": ["Channel actions", "Acciones del canal"],
  "Adicionar ao canal": ["Add to channel", "Añadir al canal"],
  "Adicionar campo": ["Add field", "Añadir campo"],
  "Adicionar canal": ["Add channel", "Añadir canal"],
  "Adicionar coleção": ["Add collection", "Añadir colección"],
  "Adicionar item": ["Add item", "Añadir elemento"],
  "Adicionar método a um canal": ["Add method to a channel", "Añadir método a un canal"],
  Adicionar: ["Add", "Añadir"],
  "Aguardando humano": ["Waiting for human", "Esperando intervención humana"],
  "Aguardando revisão": ["Waiting for review", "Esperando revisión"],
  Agora: ["Now", "Ahora"],
  "Aparência e idioma": ["Appearance and language", "Apariencia e idioma"],
  Aparência: ["Appearance", "Apariencia"],
  Aprovado: ["Approved", "Aprobado"],
  "Arquivar canal": ["Archive channel", "Archivar canal"],
  "Arraste para reorganizar": ["Drag to reorder", "Arrastra para reordenar"],
  "Assets Visuais": ["Visual Assets", "Recursos visuales"],
  "Atualizar modelos": ["Refresh models", "Actualizar modelos"],
  "Atualizar YouTube": ["Refresh YouTube", "Actualizar YouTube"],
  Atualizar: ["Refresh", "Actualizar"],
  "Biblioteca estratégica": ["Strategic library", "Biblioteca estratégica"],
  Biblioteca: ["Library", "Biblioteca"],
  "Bloco validado": ["Validated block", "Bloque validado"],
  Bloqueado: ["Blocked", "Bloqueado"],
  "Buscar por canal, processo ou ação...": [
    "Search by channel, process, or action...",
    "Buscar por canal, proceso o acción...",
  ],
  "Buscar projeto…": ["Search project…", "Buscar proyecto…"],
  "Buscar referências": ["Search references", "Buscar referencias"],
  Buscar: ["Search", "Buscar"],
  "Cada canal é um workspace independente de produção de conteúdo.": [
    "Each channel is an independent content production workspace.",
    "Cada canal es un espacio de trabajo independiente de producción de contenido.",
  ],
  Campo: ["Field", "Campo"],
  "Campos de cada item": ["Fields for each item", "Campos de cada elemento"],
  "Canal protegido": ["Protected channel", "Canal protegido"],
  Canal: ["Channel", "Canal"],
  "Canais com métodos": ["Channels with methods", "Canales con métodos"],
  Canais: ["Channels", "Canales"],
  Cancelar: ["Cancel", "Cancelar"],
  Cards: ["Cards", "Tarjetas"],
  "Carregando seus canais...": ["Loading your channels...", "Cargando tus canales..."],
  "Chave da API da OpenAI": ["OpenAI API key", "Clave de API de OpenAI"],
  Claro: ["Light", "Claro"],
  "Código indisponível para este plugin.": [
    "Code is unavailable for this plugin.",
    "El código no está disponible para este plugin.",
  ],
  Código: ["Code", "Código"],
  Coleção: ["Collection", "Colección"],
  "Coleções estruturadas usadas pelos blocos Escolher": [
    "Structured collections used by Choose blocks",
    "Colecciones estructuradas usadas por los bloques Elegir",
  ],
  Compartilhar: ["Share", "Compartir"],
  "Conectar canal": ["Connect channel", "Conectar canal"],
  "Conectar e buscar modelos": ["Connect and load models", "Conectar y cargar modelos"],
  Concluído: ["Completed", "Completado"],
  Configuração: ["Settings", "Configuración"],
  Configurando: ["Configuring", "Configurando"],
  "Conexão OpenAI": ["OpenAI connection", "Conexión con OpenAI"],
  "Criar coleção": ["Create collection", "Crear colección"],
  "Criar ou consultar chave da API": ["Create or view API key", "Crear o consultar clave de API"],
  Criar: ["Create", "Crear"],
  "Dados de entrada": ["Input data", "Datos de entrada"],
  "Dados de saída": ["Output data", "Datos de salida"],
  "Dados locais deste dispositivo": [
    "Local data on this device",
    "Datos locales de este dispositivo",
  ],
  "Defina como cada processo funciona neste canal": [
    "Define how each process works in this channel",
    "Define cómo funciona cada proceso en este canal",
  ],
  "Descrição (opcional)": ["Description (optional)", "Descripción (opcional)"],
  Desconectar: ["Disconnect", "Desconectar"],
  Diário: ["Daily", "Diario"],
  "Duplicar configurações": ["Duplicate settings", "Duplicar configuración"],
  "Editar canal": ["Edit channel", "Editar canal"],
  "Editar coleção": ["Edit collection", "Editar colección"],
  Edição: ["Editing", "Edición"],
  "Em processamento": ["Processing", "Procesando"],
  English: ["English", "English"],
  "Entrega desta ação": ["Action output", "Entrega de esta acción"],
  Erro: ["Error", "Error"],
  "Escolha humana": ["Human choice", "Elección humana"],
  "Escolha um canal para abrir sua produção": [
    "Choose a channel to open its production workspace",
    "Elige un canal para abrir su espacio de producción",
  ],
  "Escolher opção": ["Choose an option", "Elegir una opción"],
  Escolher: ["Choose", "Elegir"],
  Escuro: ["Dark", "Oscuro"],
  "Estas preferências são globais e ficam salvas neste dispositivo.": [
    "These preferences are global and saved on this device.",
    "Estas preferencias son globales y se guardan en este dispositivo.",
  ],
  "Esta ação não exige campos adicionais.": [
    "This action does not require additional fields.",
    "Esta acción no requiere campos adicionales.",
  ],
  "Esta coleção ainda não possui itens.": [
    "This collection does not have any items yet.",
    "Esta colección todavía no tiene elementos.",
  ],
  "Executar processo": ["Run process", "Ejecutar proceso"],
  "Os blocos serão executados na ordem abaixo. A execução pausará sempre que o operador for humano.":
    [
      "The blocks will run in the order below. Execution will pause whenever the operator is human.",
      "Los bloques se ejecutarán en el orden indicado. La ejecución se pausará cuando el operador sea humano.",
    ],
  "Sem instruções adicionais": ["No additional instructions", "Sin instrucciones adicionales"],
  "Define o tema do vídeo a partir do método salvo.": [
    "Defines the video topic from the saved method.",
    "Define el tema del video a partir del método guardado.",
  ],
  "Cria títulos conforme o método salvo do canal.": [
    "Creates titles using the channel's saved method.",
    "Crea títulos según el método guardado del canal.",
  ],
  "Organiza a criação da thumbnail conforme o método salvo.": [
    "Organizes thumbnail creation using the saved method.",
    "Organiza la creación de la miniatura según el método guardado.",
  ],
  "Organiza a produção do roteiro conforme o método salvo.": [
    "Organizes script production using the saved method.",
    "Organiza la producción del guion según el método guardado.",
  ],
  "Organiza narração e áudio conforme o método salvo.": [
    "Organizes narration and audio using the saved method.",
    "Organiza la narración y el audio según el método guardado.",
  ],
  "Organiza os assets visuais conforme o método salvo.": [
    "Organizes visual assets using the saved method.",
    "Organiza los recursos visuales según el método guardado.",
  ],
  "Organiza a edição conforme o método salvo.": [
    "Organizes editing using the saved method.",
    "Organiza la edición según el método guardado.",
  ],
  "Organiza a publicação conforme o método salvo.": [
    "Organizes publishing using the saved method.",
    "Organiza la publicación según el método guardado.",
  ],
  Ações: ["Actions", "Acciones"],
  Etapa: ["Stage", "Etapa"],
  Prazo: ["Deadline", "Fecha límite"],
  Responsável: ["Owner", "Responsable"],
  Imagem: ["Image", "Imagen"],
  Link: ["Link", "Enlace"],
  Arquivo: ["File", "Archivo"],
  "Vários arquivos": ["Multiple files", "Varios archivos"],
  "Data e hora": ["Date and time", "Fecha y hora"],
  Decisão: ["Decision", "Decisión"],
  Seleção: ["Selection", "Selección"],
  "Seleção múltipla": ["Multiple selection", "Selección múltiple"],
  Modo: ["Mode", "Modo"],
  Origem: ["Source", "Origen"],
  Valor: ["Value", "Valor"],
  "Valor fixo": ["Fixed value", "Valor fijo"],
  "Layout de thumbnail": ["Thumbnail layout", "Diseño de miniatura"],
  "Prazo (opcional)": ["Deadline (optional)", "Fecha límite (opcional)"],
  "Adicionar caixa": ["Add box", "Añadir cuadro"],
  "Adicionar registro": ["Add record", "Añadir registro"],
  "Aguardando a etapa anterior": ["Waiting for the previous stage", "Esperando la etapa anterior"],
  "Aguardando ação humana": ["Waiting for human action", "Esperando una acción humana"],
  "Aguardando operador humano": ["Waiting for a human operator", "Esperando a un operador humano"],
  "Em execução": ["Running", "En ejecución"],
  "Preparando execução": ["Preparing execution", "Preparando la ejecución"],
  "Alterações pendentes": ["Pending changes", "Cambios pendientes"],
  "Erro ao salvar": ["Save error", "Error al guardar"],
  "Salvamento automático": ["Autosave", "Guardado automático"],
  "Adicionar a primeira ação": ["Add the first action", "Añadir la primera acción"],
  "Adicione a primeira ação. Um método pode ser simples ou combinar quantos blocos forem necessários.":
    [
      "Add the first action. A method can be simple or combine as many blocks as needed.",
      "Añade la primera acción. Un método puede ser simple o combinar tantos bloques como sea necesario.",
    ],
  "Adicione ao menos uma saída para concluir esta ação.": [
    "Add at least one output to complete this action.",
    "Añade al menos una salida para completar esta acción.",
  ],
  "Adicione caixas para montar a composição.": [
    "Add boxes to build the composition.",
    "Añade cuadros para crear la composición.",
  ],
  "Adicione quantos campos forem necessários para representar cada opção.": [
    "Add as many fields as needed to represent each option.",
    "Añade tantos campos como sean necesarios para representar cada opción.",
  ],
  "Adicione seu primeiro canal para começar a organizar a produção de conteúdo.": [
    "Add your first channel to start organizing content production.",
    "Añade tu primer canal para empezar a organizar la producción de contenido.",
  ],
  "Ao atingir o limite, a validação permanece pausada para decisão humana.": [
    "When the limit is reached, validation remains paused for a human decision.",
    "Al alcanzar el límite, la validación permanece pausada para una decisión humana.",
  ],
  "As posições e dimensões são salvas em porcentagens para funcionar em qualquer resolução 16:9.": [
    "Positions and dimensions are saved as percentages to work at any 16:9 resolution.",
    "Las posiciones y dimensiones se guardan como porcentajes para funcionar en cualquier resolución 16:9.",
  ],
  "As tarefas aparecerão aqui quando um processo chegar a um bloco Humano.": [
    "Tasks will appear here when a process reaches a Human block.",
    "Las tareas aparecerán aquí cuando un proceso llegue a un bloque Humano.",
  ],
  "Atualize o nome e os campos usados pelos itens desta coleção.": [
    "Update the name and fields used by items in this collection.",
    "Actualiza el nombre y los campos usados por los elementos de esta colección.",
  ],
  "Biblioteca de métodos de": ["Method library for", "Biblioteca de métodos de"],
  "Biblioteca Estratégica": ["Strategic Library", "Biblioteca Estratégica"],
  "Biblioteca global de métodos de criação salvos nos canais.": [
    "Global library of creation methods saved across channels.",
    "Biblioteca global de métodos de creación guardados en los canales.",
  ],
  "Bloco anterior": ["Previous block", "Bloque anterior"],
  "Processo anterior": ["Previous process", "Proceso anterior"],
  "Dados do projeto": ["Project data", "Datos del proyecto"],
  "Campos de cada registro": ["Fields for each record", "Campos de cada registro"],
  "Coleção estratégica": ["Strategic collection", "Colección estratégica"],
  "Coletar informações ou mídias externas.": [
    "Collect external information or media.",
    "Recopilar información o medios externos.",
  ],
  "Selecionar itens preexistentes da Biblioteca Estratégica.": [
    "Select existing items from the Strategic Library.",
    "Seleccionar elementos existentes de la Biblioteca Estratégica.",
  ],
  "Gerar conteúdo, arquivos ou executar código.": [
    "Generate content, files, or run code.",
    "Generar contenido, archivos o ejecutar código.",
  ],
  "Testar qualidade, regras ou pedir aprovação.": [
    "Test quality, rules, or request approval.",
    "Comprobar calidad, reglas o solicitar aprobación.",
  ],
  "Configurar método": ["Configure method", "Configurar método"],
  "Criar ou importar método": ["Create or import method", "Crear o importar método"],
  "Crie métodos dentro de um canal ou importe um arquivo compartilhado.": [
    "Create methods within a channel or import a shared file.",
    "Crea métodos dentro de un canal o importa un archivo compartido.",
  ],
  "Crie uma coleção, defina os campos que formam cada item e depois alimente essa base.": [
    "Create a collection, define the fields that make up each item, then populate it.",
    "Crea una colección, define los campos de cada elemento y después completa esa base.",
  ],
  "Dê um nome à coleção e defina o formato que todos os seus itens seguirão.": [
    "Name the collection and define the format all its items will follow.",
    "Asigna un nombre a la colección y define el formato que seguirán todos sus elementos.",
  ],
  "Defina os campos internos desta lista no editor do método.": [
    "Define this list's internal fields in the method editor.",
    "Define los campos internos de esta lista en el editor del método.",
  ],
  "Definir primeiro campo": ["Define first field", "Definir el primer campo"],
  "Digite o nome do canal abaixo para confirmar:": [
    "Enter the channel name below to confirm:",
    "Introduce el nombre del canal para confirmar:",
  ],
  "Escolha um canal para abrir sua produção.": [
    "Choose a channel to open its production workspace.",
    "Elige un canal para abrir su espacio de producción.",
  ],
  "Escolha uma base salva em outro canal. Uma cópia será criada neste canal para você reconfigurar livremente.":
    [
      "Choose a base saved in another channel. A copy will be created in this channel for you to configure freely.",
      "Elige una base guardada en otro canal. Se creará una copia en este canal para que la configures libremente.",
    ],
  "Escolher uma opção": ["Choose one option", "Elegir una opción"],
  "Escolher várias opções": ["Choose multiple options", "Elegir varias opciones"],
  "Esta ação excluirá permanentemente o canal, seus projetos, métodos e itens da biblioteca.": [
    "This action will permanently delete the channel, its projects, methods, and library items.",
    "Esta acción eliminará permanentemente el canal, sus proyectos, métodos y elementos de la biblioteca.",
  ],
  "Este método está vazio": ["This method is empty", "Este método está vacío"],
  "Explique o que deve ser feito e qual resultado é esperado.": [
    "Explain what should be done and what result is expected.",
    "Explica qué debe hacerse y qué resultado se espera.",
  ],
  "Máximo de tentativas": ["Maximum attempts", "Máximo de intentos"],
  "Nome da entrada": ["Input name", "Nombre de la entrada"],
  "Nome do projeto": ["Project name", "Nombre del proyecto"],
  "Nova entrada": ["New input", "Nueva entrada"],
  "Nova entrega": ["New output", "Nueva entrega"],
  "Novo campo": ["New field", "Nuevo campo"],
  "Relacione esta validação a uma ação anterior e defina o que acontece com o resultado.": [
    "Link this validation to a previous action and define what happens to the result.",
    "Vincula esta validación a una acción anterior y define qué ocurre con el resultado.",
  ],
  "Selecione uma ação anterior": ["Select a previous action", "Selecciona una acción anterior"],
  "Saída apresentada para escolha": [
    "Output offered for selection",
    "Salida presentada para elegir",
  ],
  "Selecione a saída com as opções": [
    "Select the output containing the options",
    "Selecciona la salida con las opciones",
  ],
  "O bloco selecionado precisa declarar uma saída para oferecer opções.": [
    "The selected block must declare an output to offer options.",
    "El bloque seleccionado debe declarar una salida para ofrecer opciones.",
  ],
  "Refazer o bloco validado": ["Redo the validated block", "Rehacer el bloque validado"],
  "Pausar para revisão manual": ["Pause for manual review", "Pausar para revisión manual"],
  "Resultado do processo": ["Process result", "Resultado del proceso"],
  "Saída do bloco": ["Block output", "Salida del bloque"],
  "Saída compatível": ["Compatible output", "Salida compatible"],
  "Compatível mais recente": ["Latest compatible", "Compatible más reciente"],
  "Valor usado nesta entrada": ["Value used for this input", "Valor usado en esta entrada"],
  "Opções fixas, uma por linha (opcional)": [
    "Fixed options, one per line (optional)",
    "Opciones fijas, una por línea (opcional)",
  ],
  "Uma opção por linha": ["One option per line", "Una opción por línea"],
  "Selecione um bloco para configurar a ação.": [
    "Select a block to configure the action.",
    "Selecciona un bloque para configurar la acción.",
  ],
  "Selecione a coleção deste bloco": [
    "Select this block's collection",
    "Selecciona la colección de este bloque",
  ],
  "Selecione o resultado": ["Select the result", "Selecciona el resultado"],
  "Escolha um dos itens da coleção para continuar o método.": [
    "Choose one of the collection items to continue the method.",
    "Elige uno de los elementos de la colección para continuar el método.",
  ],
  "Volte ao método e selecione qual coleção pertence a este bloco Escolher.": [
    "Return to the method and select the collection for this Choose block.",
    "Vuelve al método y selecciona la colección de este bloque Elegir.",
  ],
  "Abrir Biblioteca Estratégica": ["Open Strategic Library", "Abrir Biblioteca Estratégica"],
  "Execução do método": ["Method execution", "Ejecución del método"],
  "Resultados produzidos": ["Produced results", "Resultados producidos"],
  "Esta ação foi concluída sem uma entrega visual.": [
    "This action was completed without a visual output.",
    "Esta acción se completó sin una entrega visual.",
  ],
  "Executando esta ação conforme a posição definida no método.": [
    "Running this action in the position defined by the method.",
    "Ejecutando esta acción según la posición definida en el método.",
  ],
  "Entregue o resultado final deste processo": [
    "Deliver the final result for this process",
    "Entrega el resultado final de este proceso",
  ],
  "Os blocos do método terminaram. Este resultado será salvo no projeto e poderá alimentar os próximos processos.":
    [
      "The method blocks are complete. This result will be saved to the project and can feed subsequent processes.",
      "Los bloques del método han terminado. Este resultado se guardará en el proyecto y podrá alimentar los procesos siguientes.",
    ],
  "Resultado universal": ["Universal result", "Resultado universal"],
  "Salvar resultado e concluir": ["Save result and complete", "Guardar resultado y finalizar"],
  "Realize esta ação e registre as entregas para continuar.": [
    "Complete this action and record its outputs to continue.",
    "Realiza esta acción y registra sus entregas para continuar.",
  ],
  "Execução automática": ["Automatic execution", "Ejecución automática"],
  "Este bloco será executado pelo plugin configurado no Método.": [
    "This block will be run by the plugin configured in the Method.",
    "Este bloque será ejecutado por el plugin configurado en el Método.",
  ],
  "Executando automaticamente...": ["Running automatically...", "Ejecutando automáticamente..."],
  "Cancelar execução": ["Cancel execution", "Cancelar ejecución"],
  "Existem entradas sem conexão": ["Some inputs are not connected", "Hay entradas sin conexión"],
  "Não informado": ["Not provided", "No informado"],
  "Nenhum registro": ["No records", "Ningún registro"],
  "Nenhuma opção disponível.": ["No options available.", "No hay opciones disponibles."],
  "Selecionar arquivo": ["Select file", "Seleccionar archivo"],
  "Selecionar arquivos": ["Select files", "Seleccionar archivos"],
  "Selecione uma decisão": ["Select a decision", "Selecciona una decisión"],
  "Selecione uma opção": ["Select an option", "Selecciona una opción"],
  Aprovar: ["Approve", "Aprobar"],
  Reprovar: ["Reject", "Rechazar"],
  "Ação humana necessária": ["Human action required", "Se requiere una acción humana"],
  "Concluir ação humana": ["Complete human action", "Completar acción humana"],
  "Sua biblioteca está vazia": ["Your library is empty", "Tu biblioteca está vacía"],
  "Use “Adicionar item” para preencher os campos definidos na coleção.": [
    "Use “Add item” to fill in the fields defined in the collection.",
    "Usa “Añadir elemento” para completar los campos definidos en la colección.",
  ],
  "Excluir item": ["Delete item", "Eliminar elemento"],
  "Excluir projeto": ["Delete project", "Eliminar proyecto"],
  "Substituir imagem": ["Replace image", "Sustituir imagen"],
  "Mostrar informações do canal": ["Show channel information", "Mostrar información del canal"],
  "Quadro da thumbnail (16:9)": ["Thumbnail canvas (16:9)", "Lienzo de miniatura (16:9)"],
  "Mover para frente": ["Bring forward", "Traer al frente"],
  "Mover para trás": ["Send backward", "Enviar atrás"],
  "Layout vazio": ["Empty layout", "Diseño vacío"],
  "Método de": ["Method for", "Método de"],
  "Usar em outro canal": ["Use in another channel", "Usar en otro canal"],
  "Nenhum plugin instalado é compatível com este bloco, processo e contrato de saída.": [
    "No installed plugin is compatible with this block, process, and output contract.",
    "Ningún plugin instalado es compatible con este bloque, proceso y contrato de salida.",
  ],
  "permissões declaradas": ["declared permissions", "permisos declarados"],
  "Executa qualquer bloco baseado em linguagem com um modelo de texto compatível com a Responses API da OpenAI.":
    [
      "Runs any language-based block with a text model compatible with the OpenAI Responses API.",
      "Ejecuta cualquier bloque basado en lenguaje con un modelo de texto compatible con la API Responses de OpenAI.",
    ],
  "Execução cancelada": ["Execution cancelled", "Ejecución cancelada"],
  "Exportar manifesto": ["Export manifest", "Exportar manifiesto"],
  "Frequência de publicação": ["Publishing frequency", "Frecuencia de publicación"],
  "Gerencie as ferramentas que executam blocos de IA e Código": [
    "Manage tools that run AI and Code blocks",
    "Gestiona las herramientas que ejecutan bloques de IA y Código",
  ],
  Humano: ["Human", "Humano"],
  IA: ["AI", "IA"],
  Idioma: ["Language", "Idioma"],
  "Importar método": ["Import method", "Importar método"],
  Importar: ["Import", "Importar"],
  "Incluídos no aplicativo": ["Included with the app", "Incluidos en la aplicación"],
  Incluído: ["Included", "Incluido"],
  "Informe o resultado final": ["Enter the final result", "Introduce el resultado final"],
  Inglês: ["English", "Inglés"],
  "Instalação local e compartilhável": [
    "Local, shareable installation",
    "Instalación local y compartible",
  ],
  Instalado: ["Installed", "Instalado"],
  "Instalados pelo usuário": ["User-installed", "Instalados por el usuario"],
  "Instruções para o operador": ["Operator instructions", "Instrucciones para el operador"],
  "Lista de textos": ["Text list", "Lista de textos"],
  "Lista de registros": ["Record list", "Lista de registros"],
  "Método pronto para executar": ["Method ready to run", "Método listo para ejecutar"],
  "Métodos de Criação": ["Creation Methods", "Métodos de creación"],
  "Métodos salvos": ["Saved methods", "Métodos guardados"],
  Métodos: ["Methods", "Métodos"],
  "Manifestos que precisam de correção": [
    "Manifests that need attention",
    "Manifiestos que necesitan corrección",
  ],
  Miniatura: ["Thumbnail", "Miniatura"],
  "Mover para baixo": ["Move down", "Mover hacia abajo"],
  "Mover para cima": ["Move up", "Mover hacia arriba"],
  "Narração e Áudio": ["Narration and Audio", "Narración y audio"],
  Navegação: ["Navigation", "Navegación"],
  "Nenhum canal ainda": ["No channels yet", "Aún no hay canales"],
  "Nenhum método encontrado": ["No methods found", "No se encontraron métodos"],
  "Nenhum plugin instalado ainda": ["No plugins installed yet", "Aún no hay plugins instalados"],
  "Nenhum projeto ainda": ["No projects yet", "Aún no hay proyectos"],
  "Nenhuma ação humana aguardando": [
    "No human actions waiting",
    "No hay acciones humanas pendientes",
  ],
  "Nenhuma imagem selecionada": ["No image selected", "Ninguna imagen seleccionada"],
  "Nenhuma coleção vinculada": ["No collection linked", "No hay una colección vinculada"],
  "Nenhuma entrada específica. Os resultados anteriores continuam disponíveis como contexto durante a produção.":
    [
      "No specific input. Previous results remain available as context during production.",
      "No hay una entrada específica. Los resultados anteriores siguen disponibles como contexto durante la producción.",
    ],
  Nicho: ["Niche", "Nicho"],
  "Nome da ação": ["Action name", "Nombre de la acción"],
  "Nome da coleção": ["Collection name", "Nombre de la colección"],
  "Nome da saída": ["Output name", "Nombre de la salida"],
  Nome: ["Name", "Nombre"],
  "Não iniciado": ["Not started", "No iniciado"],
  "Nova coleção estratégica": ["New strategic collection", "Nueva colección estratégica"],
  "Nova tentativa solicitada pela validação": [
    "New attempt requested by validation",
    "La validación solicitó un nuevo intento",
  ],
  "Novo canal": ["New channel", "Nuevo canal"],
  "Novo item": ["New item", "Nuevo elemento"],
  "Novo projeto": ["New project", "Nuevo proyecto"],
  "Criar projeto": ["Create project", "Crear proyecto"],
  "Nome*": ["Name*", "Nombre*"],
  Número: ["Number", "Número"],
  "O projeto inicia na etapa de Tema.": [
    "The project starts at the Topic stage.",
    "El proyecto comienza en la etapa Tema.",
  ],
  Obrigatório: ["Required", "Obligatorio"],
  "Ocultar informações do canal": ["Hide channel information", "Ocultar información del canal"],
  "Operador responsável": ["Responsible operator", "Operador responsable"],
  "Página não encontrada": ["Page not found", "Página no encontrada"],
  "Pausar produção": ["Pause production", "Pausar producción"],
  "Pendências humanas": ["Human tasks", "Tareas humanas"],
  "Plugin executor": ["Runner plugin", "Plugin ejecutor"],
  "Plugin necessário para continuar": [
    "Plugin required to continue",
    "Se necesita un plugin para continuar",
  ],
  "Plugins disponíveis": ["Available plugins", "Plugins disponibles"],
  Plugins: ["Plugins", "Plugins"],
  Português: ["Portuguese", "Portugués"],
  "Preencha o formato definido para esta coleção.": [
    "Fill in the format defined for this collection.",
    "Completa el formato definido para esta colección.",
  ],
  "Processos cobertos": ["Covered processes", "Procesos cubiertos"],
  "Processos do projeto": ["Project processes", "Procesos del proyecto"],
  "Processos universais": ["Universal processes", "Procesos universales"],
  Processos: ["Processes", "Procesos"],
  "Configurar bloco de ação": ["Configure action block", "Configurar bloque de acción"],
  "Edite operador, instruções, entradas, saídas e execução deste bloco.": [
    "Edit this block's operator, instructions, inputs, outputs, and execution.",
    "Edita el operador, las instrucciones, las entradas, las salidas y la ejecución de este bloque.",
  ],
  "Clique, segure e arraste para reordenar": [
    "Click, hold, and drag to reorder",
    "Haz clic, mantén pulsado y arrastra para reordenar",
  ],
  "Recolher processos universais": [
    "Collapse universal processes",
    "Contraer procesos universales",
  ],
  "Expandir processos universais": ["Expand universal processes", "Expandir procesos universales"],
  saída: ["output", "salida"],
  saídas: ["outputs", "salidas"],
  "Procurando plugins locais...": ["Looking for local plugins...", "Buscando plugins locales..."],
  "Projeto não encontrado": ["Project not found", "Proyecto no encontrado"],
  Projeto: ["Project", "Proyecto"],
  Projetos: ["Projects", "Proyectos"],
  Publicação: ["Publishing", "Publicación"],
  Quinzenal: ["Every two weeks", "Quincenal"],
  "Quer participar do desenvolvimento do ContentFlow?": [
    "Want to help develop ContentFlow?",
    "¿Quieres participar en el desarrollo de ContentFlow?",
  ],
  "Regra de validação": ["Validation rule", "Regla de validación"],
  "Remover bloco": ["Remove block", "Eliminar bloque"],
  "Remover canal": ["Remove channel", "Eliminar canal"],
  "Remover canal?": ["Remove channel?", "¿Eliminar canal?"],
  "Remover campo": ["Remove field", "Eliminar campo"],
  Remover: ["Remove", "Eliminar"],
  "Resultado final": ["Final result", "Resultado final"],
  Roteiro: ["Script", "Guion"],
  "Salvar agora": ["Save now", "Guardar ahora"],
  "Salvar alterações": ["Save changes", "Guardar cambios"],
  "Salvo automaticamente": ["Saved automatically", "Guardado automáticamente"],
  "Selecionar imagem": ["Select image", "Seleccionar imagen"],
  "Selecione o canal": ["Select a channel", "Selecciona un canal"],
  "Selecione um plugin compatível": [
    "Select a compatible plugin",
    "Selecciona un plugin compatible",
  ],
  "Sem instruções": ["No instructions", "Sin instrucciones"],
  "Seus canais": ["Your channels", "Tus canales"],
  "Sim ou não": ["Yes or no", "Sí o no"],
  "Sobre o que é esse canal, público-alvo, tom de voz…": [
    "What this channel is about, audience, tone of voice…",
    "De qué trata este canal, audiencia, tono de voz…",
  ],
  "Solte para posicionar": ["Drop to position", "Suelta para posicionar"],
  Tabela: ["Table", "Tabla"],
  Tema: ["Topic", "Tema"],
  "Texto curto": ["Short text", "Texto corto"],
  "Texto longo": ["Long text", "Texto largo"],
  Thumbnail: ["Thumbnail", "Miniatura"],
  "Título *": ["Title *", "Título *"],
  Título: ["Title", "Título"],
  "Tarefas humanas": ["Human tasks", "Tareas humanas"],
  "Todos os processos": ["All processes", "Todos los procesos"],
  "Use da biblioteca": ["Use from library", "Usar de la biblioteca"],
  "Use nosso agente para auxiliar na criação do seu método": [
    "Use our agent to help create your method",
    "Usa nuestro agente para ayudarte a crear tu método",
  ],
  "Use, compartilhe e gerencie métodos salvos nos seus canais": [
    "Use, share, and manage methods saved in your channels",
    "Usa, comparte y gestiona los métodos guardados en tus canales",
  ],
  Validar: ["Validate", "Validar"],
  "Ver estrutura e código": ["View structure and code", "Ver estructura y código"],
  "Visão geral": ["Overview", "Vista general"],
  "Workspaces independentes de estratégia e produção": [
    "Independent strategy and production workspaces",
    "Espacios independientes de estrategia y producción",
  ],
  "Página inicial": ["Home", "Inicio"],
  Espanhol: ["Spanish", "Español"],
  "Claro e escuro": ["Light and dark", "Claro y oscuro"],
};

const textStates = new WeakMap<Text, { source: string; lastApplied: string }>();
const attributeStates = new WeakMap<
  Element,
  Map<string, { source: string; lastApplied: string }>
>();

function phrase(source: string, language: AppLanguage) {
  if (language === "pt-BR") return source;
  const translation = PHRASES[source];
  return translation?.[language === "en" ? 0 : 1] ?? source;
}

function translateDynamic(source: string, language: AppLanguage): string {
  if (language === "pt-BR") return source;
  const exact = phrase(source, language);
  if (exact !== source) return exact;

  const sentenceFragment = source.match(/^([.!?]\s+)(.+)$/);
  if (sentenceFragment) {
    const translatedFragment = phrase(sentenceFragment[2], language);
    if (translatedFragment !== sentenceFragment[2]) {
      return `${sentenceFragment[1]}${translatedFragment}`;
    }
  }

  const translatedProcess = (value: string) => phrase(value, language);
  let match = source.match(/^(\d+) ativos$/);
  if (match) return language === "en" ? `${match[1]} active` : `${match[1]} activos`;
  match = source.match(/^(.+?)\s+inscritos$/);
  if (match) return language === "en" ? `${match[1]} subscribers` : `${match[1]} suscriptores`;
  match = source.match(/^(\d+) (item|itens)$/);
  if (match) {
    if (language === "en") return `${match[1]} ${match[1] === "1" ? "item" : "items"}`;
    return `${match[1]} ${match[1] === "1" ? "elemento" : "elementos"}`;
  }
  match = source.match(/^(\d+) (bloco|blocos)$/);
  if (match) {
    if (language === "en") return `${match[1]} ${match[1] === "1" ? "block" : "blocks"}`;
    return `${match[1]} ${match[1] === "1" ? "bloque" : "bloques"}`;
  }
  match = source.match(/^(\d+) (saída|saídas)$/);
  if (match) {
    if (language === "en") return `${match[1]} ${match[1] === "1" ? "output" : "outputs"}`;
    return `${match[1]} ${match[1] === "1" ? "salida" : "salidas"}`;
  }
  match = source.match(/^Bloco (\d+) de (\d+)$/);
  if (match)
    return language === "en"
      ? `Block ${match[1]} of ${match[2]}`
      : `Bloque ${match[1]} de ${match[2]}`;
  match = source.match(/^Método de (.+)$/);
  if (match)
    return language === "en"
      ? `${translatedProcess(match[1])} method`
      : `Método de ${translatedProcess(match[1])}`;
  match = source.match(
    /^(\d{2}) · (Tema|Título|Thumbnail|Roteiro|Narração e Áudio|Assets Visuais|Edição|Publicação)$/,
  );
  if (match) return `${match[1]} · ${translatedProcess(match[2])}`;
  match = source.match(/^Voltar para (.+)$/);
  if (match)
    return language === "en"
      ? `Back to ${translatedProcess(match[1])}`
      : `Volver a ${translatedProcess(match[1])}`;
  match = source.match(/^(\d+) de (\d+) projetos$/);
  if (match)
    return language === "en"
      ? `${match[1]} of ${match[2]} projects`
      : `${match[1]} de ${match[2]} proyectos`;
  match = source.match(/^(\d+) de (\d+)$/);
  if (match) return language === "en" ? `${match[1]} of ${match[2]}` : `${match[1]} de ${match[2]}`;
  match = source.match(/^(\d+) coleção e (\d+) itens$/);
  if (match)
    return language === "en"
      ? `${match[1]} collection and ${match[2]} items`
      : `${match[1]} colección y ${match[2]} elementos`;
  match = source.match(/^Há (\d+) (min|h|d)$/);
  if (match)
    return language === "en" ? `${match[1]}${match[2]} ago` : `Hace ${match[1]} ${match[2]}`;
  match = source.match(/^Cor (#[A-Fa-f0-9]{6})$/);
  if (match) return language === "en" ? `Color ${match[1]}` : `Color ${match[1]}`;
  match = source.match(/^Reorganizar (.+)$/);
  if (match) return language === "en" ? `Reorder ${match[1]}` : `Reordenar ${match[1]}`;
  match = source.match(/^Editar coleção (.+)$/);
  if (match)
    return language === "en" ? `Edit collection ${match[1]}` : `Editar colección ${match[1]}`;
  match = source.match(/^Novo item em (.+)$/);
  if (match) return language === "en" ? `New item in ${match[1]}` : `Nuevo elemento en ${match[1]}`;
  match = source.match(/^Excluir coleção (.+)$/);
  if (match)
    return language === "en" ? `Delete collection ${match[1]}` : `Eliminar colección ${match[1]}`;
  match = source.match(/^(\d+) permissões declaradas$/);
  if (match)
    return language === "en"
      ? `${match[1]} declared permissions`
      : `${match[1]} permisos declarados`;
  match = source.match(/^(\d+) tarefas humanas pendentes$/);
  if (match)
    return language === "en"
      ? `${match[1]} pending human tasks`
      : `${match[1]} tareas humanas pendientes`;
  return source;
}

export function translate(source: string, language: AppLanguage) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  const core = source.trim();
  if (!core) return source;
  const normalizedCore = core.replace(/\s+/g, " ");
  const translated = translateDynamic(normalizedCore, language);
  const nextCore = translated === normalizedCore && normalizedCore !== core ? core : translated;
  return `${leading}${nextCore}${trailing}`;
}

function shouldIgnore(node: Node) {
  const parent = node instanceof Element ? node : node.parentElement;
  return Boolean(parent?.closest("[data-i18n-ignore], code, pre, script, style"));
}

function translateTextNode(node: Text, language: AppLanguage) {
  if (shouldIgnore(node)) return;
  const current = node.nodeValue ?? "";
  const state = textStates.get(node);
  const source = state && current === state.lastApplied ? state.source : current;
  const next = translate(source, language);
  textStates.set(node, { source, lastApplied: next });
  if (current !== next) node.nodeValue = next;
}

const TRANSLATED_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;

function translateElementAttributes(element: Element, language: AppLanguage) {
  if (shouldIgnore(element)) return;
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }
  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const state = states.get(attribute);
    const source = state && current === state.lastApplied ? state.source : current;
    const next = translate(source, language);
    states.set(attribute, { source, lastApplied: next });
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function translateTree(root: Node, language: AppLanguage) {
  if (root instanceof Text) {
    translateTextNode(root, language);
    return;
  }
  if (root instanceof Element) translateElementAttributes(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) translateTextNode(current, language);
    else if (current instanceof Element) translateElementAttributes(current, language);
    current = walker.nextNode();
  }
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const persistenceQueue = useRef(Promise.resolve());
  const hasLocalChange = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/preferences")
      .then(async (response) => {
        if (!response.ok) throw new Error("Preferences API unavailable");
        return (await response.json()) as AppPreferences;
      })
      .then((stored) => {
        if (active && !hasLocalChange.current) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...stored });
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", preferences.theme === "light");
    document.documentElement.classList.toggle("dark", preferences.theme === "dark");
    document.documentElement.lang = preferences.language;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", preferences.theme === "light" ? "#F5F6F8" : "#18191B");
  }, [preferences]);

  useEffect(() => {
    translateTree(document.body, preferences.language);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData")
          translateTextNode(mutation.target as Text, preferences.language);
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translateElementAttributes(mutation.target, preferences.language);
        }
        mutation.addedNodes.forEach((node) => translateTree(node, preferences.language));
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES],
    });
    return () => observer.disconnect();
  }, [preferences.language]);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    hasLocalChange.current = true;
    setPreferences((current) => {
      const next = { ...current, ...patch };
      persistenceQueue.current = persistenceQueue.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          });
          if (!response.ok) throw new Error("Could not save preferences");
        })
        .catch((error) => console.error(error));
      return next;
    });
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      ready,
      setTheme: (theme) => updatePreferences({ theme }),
      setLanguage: (language) => updatePreferences({ language }),
      t: (source) => translate(source, preferences.language),
    }),
    [preferences, ready, updatePreferences],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("useAppPreferences must be used inside AppPreferencesProvider");
  return context;
}
