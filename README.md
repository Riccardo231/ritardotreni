# Vado o Non Vado — Il Tabellone del Destino

App a pagina singola (nessun build, nessun server) che legge i tabelloni live RFI di
Ivrea, Chivasso e Torino Porta Nuova e sputa un verdetto: **vai o non vai**.

## Come funziona

- Legge l'HTML pubblico dei tabelloni `iechub.rfi.it` direttamente dal browser.
- Siccome RFI non manda gli header CORS, passa attraverso un proxy pubblico
  (di default `allorigins.win`, cambiabile dalle impostazioni in fondo alla pagina).
- Calcola un "indice caos" per ciascuna stazione (ritardo medio, ritardo massimo,
  % di treni in ritardo, eventuali soppressioni) ed esclude dal calcolo le corse
  bus sostitutive per Aosta, che sono un servizio strutturale sulla linea e non
  un'emergenza del giorno.
- Nessun dato viene salvato su un server: tutto resta nel tuo browser
  (le uniche cose in `localStorage` sono il proxy scelto e la soglia di ritardo).

## Deploy su GitHub Pages (5 minuti)

1. Crea un nuovo repository su GitHub (es. `ritardotreni`).
2. Carica il file `index.html` nella root del repository (drag & drop dalla
   pagina web di GitHub va benissimo, non serve git da terminale).
3. Vai su **Settings → Pages**.
4. In "Build and deployment", scegli **Deploy from a branch**, branch `main`,
   cartella `/ (root)`.
5. Salva. Dopo 1-2 minuti l'app sarà live su
   `https://riccardo231.github.io/ritardotreni/`.

## Se il verdetto dice sempre "BOH"

Vuol dire che il proxy CORS di default è sovraccarico o irraggiungibile (i proxy
pubblici gratuiti a volte vanno giù). Apri "Impostazioni & note tecniche" in fondo
alla pagina e prova `corsproxy.io` o `codetabs.com` dal menu a tendina.

Se vuoi qualcosa di più stabile nel tempo, la soluzione definitiva è ospitare tu
un piccolo proxy CORS (es. un Cloudflare Worker di poche righe che fa da tramite
verso `iechub.rfi.it`) e inserire il suo URL nel campo "Personalizzato" — ma per
un uso occasionale i proxy pubblici bastano.

## Disclaimer

Dati non ufficiali, letti da una pagina pubblica RFI a puro scopo informativo/
ironico. Per l'orario legale e le informazioni ufficiali usa sempre l'app
Trenitalia/FS o il tabellone fisico in stazione. Nessuna affiliazione con RFI
o Trenitalia.
