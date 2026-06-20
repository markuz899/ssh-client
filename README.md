# AetherSSH

Client SSH desktop (Electron + React) con terminale multi-tab, connessioni
salvate e un'interfaccia "terminal neon / cyber". Costruito per il flusso tipo:

```bash
ssh -i effatta.pem effatta@52.166.113.244
```

## Cosa fa

- **Connessioni salvate** con nome, descrizione, colore, host/porta/utente e
  metodo di autenticazione (chiave `.pem`, password o `ssh-agent`).
- **Chiavi e segreti cifrati**: la chiave privata, la passphrase e la password
  vengono salvate cifrate tramite `safeStorage` (Keychain su macOS). Su disco i
  metadati restano in chiaro, i segreti no. In alternativa puoi referenziare un
  `.pem` su disco senza importarlo.
- **Terminale multi-tab** basato su `xterm.js` + `ssh2`. Ogni tab è una shell
  PTY indipendente; il pulsante ⧉ apre un **nuovo tab sulla stessa connessione**.
- **Split View**: ogni tab si può dividere in più pannelli (orizzontali e
  verticali) ridimensionabili con drag&drop; ogni pannello ha una sessione SSH,
  stato e cronologia separati. Layout **salvabili e ripristinabili** dal menu ▦.
- **Comandi salvati** per connessione: appaiono come snippet cliccabili sotto il
  terminale. Clic = invia ed esegue; `Alt`+clic = digita senza premere Invio.
  Puoi anche definire un **comando all'avvio** eseguito automaticamente.
- **Parse rapido**: incolla una riga `ssh -i chiave.pem utente@host -p 2222` nel
  form e i campi si compilano da soli.
- **Otto sezioni** dalla barra di navigazione a sinistra: **Home** (panoramica
  di tutte le connessioni con ping di raggiungibilità live e azioni rapide),
  **Terminali**, **Monitor**, **File** (gestore SFTP con drag&drop, download,
  crea file/cartella, editor remoto), **Tunnel** (port forwarding locale/remoto),
  **Logs** (stream `tail -f` in tempo reale, indipendenti per sessione, con
  filtro per testo/livello, ricerca, pausa, svuota ed esporta), **Docker** e
  **AI** (assistente contestuale).
- **Monitoraggio server**: apre una connessione SSH dedicata e mostra in tempo reale —
  con polling ogni 2,5s — uso CPU (anello + storico), RAM e swap, carico medio
  (1/5/15m), dischi e i processi top per CPU. Legge `/proc` via `exec`, senza
  shell interattiva, quindi non interferisce con i terminali aperti.
- **Docker**: rileva automaticamente Docker sul server (versione engine, stato del
  daemon e permessi) e mostra una dashboard con l'elenco dei container — stato,
  uptime, porte e uso risorse (`docker stats`) aggiornati in tempo reale ogni 3s.
  Azioni rapide per container (**Start / Stop / Restart / Remove**), **log in
  diretta** (`docker logs -f`), **shell interattiva** dentro al container
  (`docker exec -it`) e un pannello statistiche dettagliato. Ogni sessione Docker
  usa una connessione SSH dedicata con **riconnessione automatica**, timeout sui
  comandi e gestione degli errori.
- **Assistente AI**: chat integrata che analizza l'output del terminale, spiega gli
  errori, genera comandi Linux/Docker/Kubernetes dal linguaggio naturale e propone
  soluzioni di troubleshooting. Usa il **contesto della sessione corrente** — host,
  output recente del terminale e, su richiesta, le metriche del server (CPU, RAM,
  dischi) — per risposte mirate; i comandi suggeriti si **inseriscono nel terminale**
  con un clic. **Multi-provider configurabile**: Anthropic (Claude, via SDK ufficiale),
  OpenAI (GPT), Google (Gemini) e endpoint compatibili OpenAI in locale (Ollama,
  LM Studio). Le **API key** dei modelli a pagamento sono salvate cifrate via
  `safeStorage`, con risposte in streaming, annullamento e test di connessione.
- **Animazioni**: sfondo a reticolo animato, overlay di handshake con radar,
  host in effetto *decrypt*, sequenza dei passi di connessione, gauge e barre
  animati nel monitor. Rispetta `prefers-reduced-motion`.

## Sviluppo

Richiede Node 18+.

```bash
npm install
npm run dev        # avvia l'app in sviluppo (hot reload)
```

## Build

```bash
npm run typecheck  # controllo tipi main + renderer
npm run build      # bundle di produzione in ./out
npm run start      # anteprima del bundle
npm run build:mac  # pacchetto .app/.dmg (richiede electron-builder)
npm run icons      # rigenera build/icon.png e build/icon.icns dal master SVG
```

L'icona dell'app è disegnata in `build/icon.svg` (stile neon/cyber, coerente con
la UI) e rasterizzata via `npm run icons` in `build/icon.{png,icns}`, usati da
electron-builder.

## Architettura

```
src/
  shared/        tipi condivisi main ⇄ renderer
  main/          processo main Electron
    index.ts     ciclo di vita app + finestra
    ssh.ts       gestione sessioni ssh2 (PTY, eventi data/status)
    docker.ts    engine Docker per server (detect, ps, stats, azioni, exec) + riconnessione
    ai.ts        orchestratore assistente AI (system prompt contestuale, streaming, annullamento)
    aiProviders.ts adapter multi-provider (Anthropic SDK, OpenAI/Gemini via fetch SSE) + catalogo
    store.ts     persistenza connessioni + segreti cifrati (safeStorage), impostazioni e chiavi AI
    ipc.ts       handler IPC
  preload/       bridge sicuro (contextBridge → window.phosphor)
  renderer/      UI React
    src/lib/       store zustand + bus eventi sessione
    src/components/ui/        componenti reactbits-style (Squares, Decrypted, Spotlight)
    src/components/Terminal/  workspace, tab, terminale, overlay, rail comandi
```

## Sicurezza

`contextIsolation` attivo, `nodeIntegration` disattivato, una CSP restrittiva
nel renderer e un `setWindowOpenHandler` che apre i link esterni nel browser.
Tutte le operazioni di rete/disco passano dal main via IPC tipizzato.
