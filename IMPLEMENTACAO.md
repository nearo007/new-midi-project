# MIDI Toolbox — implementação do plano

Data: 30/09/2026. Escopo autorizado: todas as correções e funcionalidades propostas no [diagnóstico](ANALISE_E_PLANO_DE_MELHORIAS.md). Este arquivo descreve o código atual; o diagnóstico permanece como evidência da base `2d58ee3`.

## Estrutura entregue

O monorepo continua usando Vue, Express e npm workspaces. O novo pacote [@midi-toolbox/core](packages/music-core/src/index.ts) concentra regras musicais, validação versionada, compilação de projetos, agendamento e exportação MIDI. Os contratos ficaram nesse pacote por serem pequenos e ligados ao modelo musical; uma separação adicional em `contracts` acrescentaria uma dependência sem necessidade atual.

O cliente foi dividido em `features`, `playback`, `audio`, `midi`, `infrastructure` e `ui`. As views compõem esses módulos. O transporte tem estado global independente da navegação; o editor controla operações, histórico e persistência; áudio e MIDI cuidam do ciclo de vida das notas e dispositivos.

O servidor expõe [createApp](server/src/app.ts), recebe um [MidiOutput](server/src/ports/midi-output.ts) e usa um relógio injetável no [PlayerService](server/src/application/player-service.ts). A inicialização de JZZ e o bind HTTP estão isolados no bootstrap. `MIDI_BACKEND=none` permite executar todos os recursos locais e testes sem carregar bindings nativos.

## Correções do diagnóstico

| Achados | Implementação | Evidência automatizada |
| --- | --- | --- |
| B01, B11 — maj7 e escalas | Intervalos relativos à tônica, validação do registro, implementação compartilhada. | Testes de Cmaj7, escala maior/cromática, todas as tônicas, qualidades e inversões suportadas. |
| B02, B03, B13 — entradas inválidas | Schema validado antes de alterar a execução, limites de BPM/acordes/notas, parser preserva 400, handlers assíncronos supervisionados. | HTTP continua respondendo após BPM negativo, tuplas nulas, campos fora dos limites e JSON malformado; execução anterior permanece intacta. |
| B04, B06 — loop e navegação | Cada passagem gera uma ocorrência; relógio monotônico e transporte global. | Loop de um acorde repete no domínio e em Web Audio; mudança de tela mantém controle e áudio; zero chamadas de polling de acordes no modo local. |
| B05, B07 — cancelamento e samples | Vozes com origem e estados explícitos; Stop cancela fontes futuras; release durante carregamento impede ataque tardio. | Instrumentação real de AudioContext em Chromium verifica horários de start/stop e download lento. |
| B08, B10 — notas seguradas | Note-on/off nativo, liberação idempotente, saída de origem capturada, Pointer Events, blur e desmontagem. | Relógio falso verifica duração independente do BPM; navegador verifica teclado e note-off ao navegar. |
| B09 — sobreposição | Canais de trilha separados; registro de donos por nota/canal; eventos sequenciados normalizados para retrigger e duplicatas simultâneas. | Testes de sobreposição, independência de canais, gate e ordem dos eventos. |
| B12, B13 — persistência | Schema/gerador/seed persistidos, migração do estado legado, autosave com debounce, importação validada e erros visíveis. | Reabertura preserva seed, acordes e biblioteca; importação inválida não substitui projeto; biblioteca válida sobrevive a projeto atual corrompido. |
| U01–U06 — interação | Layout adaptável, Enter/Espaço, labels, mute anunciado, botões de reordenação, menus com foco/Escape, foco visível e movimento reduzido. | Fluxos de teclado e verificações de overflow em 320/390/768/1024/1440 px; revisão visual em desktop e mobile. |
| U07–U10 — estados | Estados de transporte, conflitos entre abas, mensagens de falha, informações de MIDI separadas, diagnóstico de reprodução silenciosa, campos sem efeito desabilitados. | Testes de conflitos/revisões, dispositivo desconectado e controles ao parar. |

Também foram corrigidas falhas encontradas durante a implementação: Panic continua limpando notas se uma saída falhar; notas nativas e playback expiram sem heartbeat; desligar MIDI Thru libera sustain; alterar o tempo durante gravação cancela a tomada; notas muito curtas mantêm envelopes de áudio válidos.

### Correções da revisão adversarial da PR #1

Os seis casos foram reproduzidos em testes que falhavam antes das correções:

| Falha | Correção e regressão |
| --- | --- |
| Update de uma execução anterior alterava a execução reiniciada | Update, Stop e heartbeat validam `runId`, além de sessão/revisão. HTTP rejeita IDs antigos ou ausentes; E2E retém um update em trânsito durante Stop/Play e verifica que a nova execução continua. Stop durante Start pendente usa o ID retornado por aquela requisição. |
| Projeto válido com 2.048 notas recebia HTTP 413 | Parser HTTP aceita 1 MiB mais 4 KiB para o envelope. Teste envia projeto normalizado acima de 256 KiB em Start e Update, mantendo rejeição de corpos excessivos. |
| Editar uma nota sob outra sustentada eliminava o novo ataque MIDI | O ataque encerra o proprietário anterior daquela nota/canal no loop. Relógio falso verifica Note Off/On com a nova velocity e que o desligamento antigo não corta a nova nota. |
| Aba desatualizada apagava biblioteca/projeto atual no pagehide | Abas sem alterações não gravam; persistência compara o projeto-base e mescla operações de biblioteca sobre o conteúdo mais recente. Testes com duas abas verificam fechamento, conflito de edição, duplicação para preservar ambas as ideias e exclusão sem ressurreição. |
| Slider de velocity não alterava melodias personalizadas | Controle desabilitado com explicação para notas editadas/gravadas; velocity individual e volume da trilha permanecem disponíveis. E2E verifica materialização e Undo. |
| Fila de notas futuras consumia o limite de 128 vozes | Fontes são criadas em uma janela de 80 ms, com limite por intervalos simultâneos. E2E verifica 200 notas sequenciais sem ataques perdidos, limite simultâneo e cancelamento de ataques ainda na fila após Stop. |

## Funcionalidades entregues

| Funcionalidade | Interface e módulo principal |
| --- | --- |
| Projetos nomeados, duplicar, abrir, excluir cópia e JSON | [ProjectToolbar](client/src/features/chord-lab/ProjectToolbar.vue) e [editor](client/src/features/chord-lab/editor.ts). |
| Desfazer/refazer | Até 100 estados; agrupamento de alterações contínuas; atalhos fora de campos de texto. |
| Exportação MIDI | [SMF tipo 1](packages/music-core/src/midi-file.ts), 480 ticks por semínima, tempo e trilhas identificadas. |
| Preview e identificação das notas | Nome do acorde acionável, notas/oitavas em cada bloco; Panic interrompe previews. |
| Inversões e transposição | Modelo explícito, limites validados e operações reversíveis. |
| Duração por acorde e loop de trecho | Durações de 0,25 a 16 beats; seleção por IDs estáveis. |
| Metrônomo, contagem inicial e tap tempo | [Transporte](client/src/playback/transport.ts), mesma posição musical da sequência. |
| Presets | Minor journey, Pop I–V–vi–IV e Jazz ii–V–I; substituir ou acrescentar acordes. |
| Piano roll | [MelodyEditor](client/src/features/chord-lab/MelodyEditor.vue): altura, início, duração, velocity, inserir/remover e atalhos. |
| Gravação MIDI IN e quantização | [recording](client/src/features/chord-lab/recording.ts): uma passagem completa, substituir/acrescentar, canal de origem e velocity preservados, quantização reversível. |
| Canais, volumes e Thru | Mixer por trilha, filtro de canal da entrada, sustain por canal, encaminhamento opcional e proteção contra entrada/saída de mesmo ID/nome. |
| Exportação WAV | [Audio engine](client/src/audio/engine.ts): OfflineAudioContext independente, piano/8-bit e reverb, PCM estéreo 16 bits a 44,1 kHz. |

## Decisões de execução

- O navegador agenda Web Audio e Web MIDI diretamente. JZZ usa a mesma sequência compilada no servidor. Polling de 30 ms deixou de comandar sons; um heartbeat de 1,5 s apenas supervisiona a sessão nativa.
- Início nativo e áudio local usam um instante futuro e estimativa do deslocamento entre relógios. Updates usam uma próxima transição após um prazo comum; resposta tardia interrompe a execução com mensagem para reiniciar.
- Edições locais entram na próxima transição ainda não agendada. Stop cancela agendamentos; Panic inclui notas ao vivo, entrada e cauda de reverb.
- Notas MIDI simultâneas do mesmo pitch/canal não são vozes independentes no protocolo MIDI 1.0. Eventos compilados encerram a nota anterior no novo ataque; duplicatas no mesmo instante compartilham duração. O teclado ao vivo usa um canal fora das trilhas.
- Navegar entre Piano e Chord Lab mantém playback. Ocultar a aba para a execução deliberadamente. Perder o foco libera teclas seguradas.
- Gravação usa uma passagem completa, após a contagem inicial; a seleção de loop é restaurada ao terminar. Mudar a identidade do projeto ou seu tempo/estrutura cancela a tomada sem substituir a melodia anterior.
- MIDI e WAV exportam a progressão completa uma vez, incluindo mutes/volumes. WAV não captura o instrumento MIDI externo nem inclui entrada ao vivo, metrônomo ou contagem. Limite de 3 minutos renderizados incluindo a cauda; MIDI atende composições maiores.
- Seeds, notas editadas, canais e parâmetros musicais pertencem ao projeto. Preferências de áudio/tema/dispositivos pertencem ao navegador. Erros de storage não impedem continuar editando e exportando.
- Não foram introduzidos serviços de autenticação, colaboração remota, marketplace ou infraestrutura distribuída; esses itens já estavam adiados no plano.

## Qualidade e operação

Scripts permanentes: `typecheck`, `lint`, `format`, `format:check`, `test`, `test:e2e`. O pacote de domínio usa `noUncheckedIndexedAccess`. Artefatos de build e relatórios de testes são ignorados. O README documenta uso, arquitetura, limites e opções de execução. HOST/PORT são validados; o bind padrão é loopback. Start/update/stop/falhas nativas geram logs estruturados com execução, revisão e dispositivo, sem registrar cada tick musical.

[CI](.github/workflows/ci.yml) instala pelo lockfile e executa formatação, lint, tipos, testes e build/E2E em Node 22 e 24. Foi configurado no repositório; a execução remota depende de publicar as alterações. As verificações locais foram realizadas em Node 24.18.0.

Dependências foram atualizadas junto com o lockfile, incluindo Vite e ferramentas de qualidade. `npm audit` retornou zero vulnerabilidades no ambiente desta implementação.

### Validação local

| Verificação | Resultado |
| --- | --- |
| `npm run format:check` | Passou. |
| `npm run lint` | Passou. |
| `npm run typecheck` | Passou nos três workspaces. |
| `npm test` | 23 testes passaram. |
| `npm run build` | Cliente, servidor e pacote compartilhado compilados. |
| `npm run test:e2e` | 24 testes passaram em Chromium. |
| Servidor de desenvolvimento | Piano e Chord Lab carregaram em Chromium, incluindo rota lazy; nenhum erro JavaScript. |
| `npm audit` | Zero vulnerabilidades. |

Os testes permanentes estão em [tests](tests/), incluindo um parser independente do formato MIDI exportado e leitura dos headers/duração/conteúdo do WAV gerado no navegador. Neste host, o Chromium precisou de bibliotecas de sistema carregadas por `LD_LIBRARY_PATH`; o CI instala essas dependências com `playwright install --with-deps`.

Uma medição dos tokens dos sete temas encontrou contraste entre `--text` e `--surface` de 13,63:1 a 15,38:1, e entre `--muted` e `--surface-raised` de 5,85:1 a 6,39:1. Isso verifica essas combinações de cores; não é uma certificação de todos os estados da interface.

### Validação dependente do ambiente

Não havia sintetizador ou porta MIDI física disponível. Permanecem para ensaio em hardware: ataque/release audível, hot-plug JZZ, troca de dispositivo sob sustain, latência e drift prolongado, e importação do `.mid` numa DAW real. O arquivo é validado estruturalmente por teste automatizado; isso não substitui compatibilidade com cada DAW.

A UI foi ensaiada em Chromium. Safari/Firefox, leitores de tela reais e conformidade completa de contraste/WCAG não foram certificados. A prevenção de feedback cobre o dispositivo reconhecido pela aplicação; rotas físicas ou virtuais externas exigem configuração sem retorno. Uso nativo depende do runtime MIDI do sistema.
