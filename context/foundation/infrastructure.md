---
project: most-likely-to
researched_at: 2026-09-26
updated: 2026-11-14
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7.3 (SSR) + React 19; Supabase (auth + Postgres) jako zewnętrzna usługa
  runtime: Cloudflare Workers (workerd, nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Workers to jedyna z sześciu badanych platform z oceną Pass we wszystkich pięciu kryteriach. Darmowy plan (100 000 żądań dziennie, zimny start rzędu milisekund, bez usypiania) pokrywa grę dla około 100 osób, a w wywiadzie priorytetem był najniższy koszt. Projekt jest już skonfigurowany pod Workers (`@astrojs/cloudflare` 14.3.1, `wrangler.jsonc`), więc nie trzeba wymieniać adaptera. Test anti-bias sprawdził, czy wygrana nie wynika tylko z tej wygody: bez niej Workers i tak prowadzą. Runda na żywo idzie przez Supabase Realtime: przeglądarka subskrybuje publiczny kanał kluczem publishable, a stan pobiera z naszego serwera, więc platforma nie musi trzymać połączeń. Sprawdzone w F-01 (2026-10-04): runda na żywo to publiczny kanał-dzwonek + stan z serwera; na produkcji 20 graczy dostało każdy dzwonek ze stanem w 2 s, najwolniejszy w 247 ms (`context/archive/2026-09-27-live-sync-spike/measurements.md`). Durable Objects zostają planem B, na razie niepotrzebnym.

Odpowiedzi z wywiadu (2026-09-26):

- połączenia na żywo po stronie serwera: nie wiem;
- koszt: minimalizuj;
- znajomość platform: brak;
- zasięg: jeden region (Europa), przy czym grać może każdy;
- usługi: zewnętrzny Supabase.

Decyzja Karola po testach anti-bias (2026-09-26): zostajemy przy Cloudflare Workers, a ryzyka trafiają do rejestru poniżej.

## Platform Comparison

Twarde filtry nie odrzuciły żadnej platformy: każda ma oficjalny adapter dla Astro 7, a odpowiedź „nie wiem” o połączeniach na żywo nie uruchamia filtra.

| Platforma          | CLI-first | Managed/Serverless | Dokumentacja dla agenta | Stabilne API wdrożeń | MCP / integracja | Suma              |
| ------------------ | --------- | ------------------ | ----------------------- | -------------------- | ---------------- | ----------------- |
| Cloudflare Workers | Pass      | Pass               | Pass                    | Pass                 | Pass             | 5 Pass            |
| Vercel             | Pass      | Pass               | Pass                    | Pass                 | Partial          | 4 Pass, 1 Partial |
| Render             | Partial   | Pass               | Pass                    | Pass                 | Pass             | 4 Pass, 1 Partial |
| Fly.io             | Pass      | Pass               | Pass                    | Partial              | Partial          | 3 Pass, 2 Partial |
| Netlify            | Partial   | Pass               | Pass                    | Partial              | Partial          | 2 Pass, 3 Partial |
| Railway            | Partial   | Pass               | Pass                    | Partial              | Partial          | 2 Pass, 3 Partial |

Wagi z wywiadu i PRD:

- **Minimalizuj koszt:** kara dla Fly.io (brak darmowego planu), Railway (realnie plan Hobby za 5 $/mies.) i Rendera (bez usypiania 7 $/mies.).
- **PRD** („gość dołącza w mniej niż 30 s”, „10 pytań bez awarii”): kara dla darmowego Rendera (pobudka ok. 1 min) i darmowego Netlify (po wyczerpaniu kredytów strona staje).
- Jeden region i zewnętrzna baza nie zmieniły kolejności.

**Cloudflare Workers.**

- **CLI:** wrangler 4.x obsługuje cały cykl: `deploy`, `versions upload/deploy`, `rollback [version-id]`, `tail`, `secret put/list`, `deployments list`. Polecenia sprawdzone na lokalnym wranglerze 4.131.1.
- **Darmowy plan:**
  - 100 000 żądań dziennie;
  - 10 ms CPU na wywołanie (czekanie na bazę się nie liczy);
  - skrypt do 64 MiB i 50 podżądań;
  - po przekroczeniu dziennego limitu błąd 1027.
- **Dokumentacja i MCP:** dokumentacja w `llms.txt` i jako Markdown. Oficjalne serwery MCP obejmują dokumentację, bindings i observability, ale Code Mode jest [eksperymentalny].
- **Adapter i Pages:** `@astrojs/cloudflare` 14.x wspiera Astro 7 (peer `^7.2.0`). Cloudflare i Astro zalecają Workers zamiast Pages dla nowych projektów. Pages jest nadal wspierane, ale nie dostaje nowych funkcji.
- **Plan B dla rundy na żywo:** Durable Objects z WebSocket Hibernation są [GA] w darmowym planie.
- **Wdrożenia z gita:** Workers Builds wdraża po każdym pushu i publikuje Preview URL dla gałęzi innych niż produkcyjna. Strona dokumentacji nie oznacza go jako beta (2026-09-26).

**Vercel.**

- **Plusy:**
  - kompletne CLI (`vercel deploy --prod`, `rollback`, `logs`, `env`);
  - `@astrojs/vercel` 11.x wspiera Astro 7;
  - region `fra1` dostępny w darmowym planie Hobby;
  - twarde limity bez dopłat;
  - podglądy PR w pakiecie.
- **Minusy:**
  - trzeba wymienić adapter;
  - funkcje produkcyjne są archiwizowane po 2 tygodniach bez ruchu, więc pierwsze żądanie trwa co najmniej sekundę dłużej;
  - Hobby jest tylko do użytku niekomercyjnego;
  - MCP i WebSockets są w [public beta], przy czym WebSockets nie są nam potrzebne.

**Render.**

- **Plusy:** CLI [GA] (wdrożenia, rollback, logi; zmienne środowiskowe tylko w panelu albo `render.yaml`), MCP [GA], dokumentacja jako Markdown i `llms.txt`, region we Frankfurcie.
- **Darmowy plan:** usypia po 15 min, a pobudka trwa około minuty. Podglądy PR są dopiero od planu Pro. Najtańszy plan bez usypiania (Starter) kosztuje około 7 $/mies.
- **Migracja:** wymiana na `@astrojs/node` i `HOST=0.0.0.0`.

**Fly.io.**

- **Plusy:** kompletne flyctl, natywne WebSockets, regiony EU (`fra`, `ams`), automatyczne zatrzymywanie maszyn.
- **Minusy:**
  - brak darmowego planu dla nowych kont: trial to 2 h maszyny albo 7 dni, potem karta;
  - przy autostopie koszt ok. 0–2 $/mies.;
  - rollback przez ponowne wdrożenie obrazu (`fly deploy -i`);
  - MCP [eksperymentalny];
  - kontener z Dockerfile.

**Netlify.**

- **Plusy:** `@astrojs/netlify` 8.x wspiera Astro 7, podglądy PR w pakiecie.
- **Minusy:**
  - CLI nie ma polecenia rollback;
  - darmowy plan daje 300 kredytów miesięcznie, a wdrożenie produkcyjne kosztuje 15, czyli wystarcza na około 20 wdrożeń. Po wyczerpaniu stają wszystkie strony konta;
  - darmowe funkcje działają tylko w us-east-2 (Ohio); region EU dopiero od planu Pro;
  - brak WebSockets.

**Railway.**

- **Plusy:** CLI obsługuje wdrożenia, logi i zmienne.
- **Minusy:**
  - rollback tylko w panelu, a obrazy na planie Free są trzymane 24 h;
  - plan Free to około 1 $ kredytu miesięcznie, więc realnie trzeba płacić 5 $/mies. za Hobby z kartą;
  - jeden region EU (Amsterdam);
  - MCP w fazie „public testing”.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

- Komplet Pass w kryteriach.
- Darmowy plan bez usypiania i bez karty (według researchu).
- Zero pracy migracyjnej.
- Najlepsze narzędzia wiersza poleceń do cofania wdrożeń: `wrangler rollback`.
- Na wypadek, gdyby Supabase Realtime nie wystarczył, jest plan B po tej samej stronie (Durable Objects).

#### 2. Vercel

- Równie dobre CLI i dokumentacja, darmowy region we Frankfurcie, podglądy PR w pakiecie.
- Przegrywa przez wymianę adaptera, MCP w becie i archiwizację funkcji po 2 tygodniach bez ruchu. Przy grze co 1–2 tygodnie to realne spowolnienie pierwszego wejścia.

#### 3. Render

- Najdojrzalszy zestaw narzędzi wśród platform kontenerowych (CLI i MCP [GA]).
- Darmowy plan usypia aplikację na tyle długo (około minuty pobudki), że łamie guardrail z PRD. Bez usypiania kosztuje około 7 $/mies., a do tego dochodzi wymiana adaptera na `@astrojs/node`.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Workers to nie Node.**
   - `nodejs_compat` pokrywa dużo, ale paczka npm sięgająca po system plików, moduły natywne albo długie połączenia TCP może wyłożyć się dopiero na produkcji.
   - Agenci uczeni na starszych poradnikach piszą `Astro.locals.runtime`, które według researchu zniknęło w adapterze 13+. Sekrety czytamy wyłącznie przez `astro:env/server`.
2. **Limit 10 ms CPU na żądanie w darmowym planie.**
   - Zwykłe SSR mieści się w nim z zapasem.
   - Cięższa strona albo kryptografia, np. weryfikacja nicku z FR-011, przy 20 graczach wracających naraz po zerwaniu Wi-Fi może skończyć się błędami przekroczenia CPU.
3. **Platforma nie rozwiązuje rundy na żywo.**
   - Worker bez Durable Objects nie utrzyma połączeń na żywo, więc odsłona stoi na Supabase Realtime.
   - Jeśli to zawiedzie, plan B (Durable Objects) oznacza kod pisany tylko pod Cloudflare, czyli uzależnienie od dostawcy.
4. **Podejrzanie wygodny zwycięzca.**
   - Cloudflare jest już skonfigurowany, więc grozi efekt „bierzemy to, co jest”.
   - Kurs i `tech-stack.md` mówią Pages, a kod stoi na Workers. Łatwo o polecenie `wrangler pages` od agenta.
5. **Nie wszystkie polecenia zmieniające produkcję pytają o zgodę.**
   - `Bash(npx *)` jest w allow, a ask obejmuje tylko `npx wrangler deploy` i `npx wrangler secret *`.
   - Dlatego `npx wrangler rollback`, `npx wrangler versions deploy` i `npx wrangler delete` przejdą dziś bez pytania.

### Pre-Mortem — How This Could Fail

Jest marzec 2027. Gra umarła po trzecim wieczorze i nikt do niej nie wraca. Pierwsze błędne założenie: „baza zawsze działa”. Po dwutygodniowej przerwie darmowy Supabase uśpił projekt. W piątek o 20:00 logowanie hosta zwracało błąd, piętnaście osób czekało na Discordzie, a wieczór skończył się na Google Forms. Drugie założenie: „Workers to po prostu Node”. Agent dodał bibliotekę do weryfikacji nicku, która lokalnie działała, a na produkcji, przy dwudziestu graczach wracających naraz po zerwaniu Wi-Fi, przekraczała limit CPU i sypała błędami. Trzecie założenie: „realtime mamy z głowy”. Odsłona szła przez publiczny kanał Supabase, więc kolega z otwartymi narzędziami przeglądarki podejrzał zdarzenia i wysłał fałszywą odsłonę. Zaufanie do anonimowości głosów się skończyło. (Stan na 2026-11-14: od F-01 kanał niesie tylko dzwonek, a stan pokoju zawsze przychodzi z serwera; od `players-only-live-channel` emotki idą osobnym tematem z klucza kanału, który znają tylko gracze pokoju.) Czwarte założenie: „wdrożenia są bezpieczne”. Automatyczny deploy z `main` wypchnął zepsuty commit pół godziny przed grą, a nikt nie pamiętał, że `wrangler rollback` cofa go w kilka sekund. Żadna z tych porażek nie wynikała z samego Cloudflare, tylko z założeń, których nikt nie sprawdził przed pierwszym wieczorem.

### Unknown Unknowns

- **Darmowy Supabase usypia projekt po 7 dniach bez aktywności bazy.** Uśpiony projekt trzeba wznowić ręcznie w panelu. Przy grze co 1–2 tygodnie to prawie pewne (sprawdzone 2026-09-26). Od 2026-10-21 przed uśpieniem chroni go pukanie z GitHub Actions: co 6 h jedno zapytanie do bazy (rejestr ryzyk, wiersz 1).
- **Kanały Supabase Realtime są domyślnie publiczne.** Każdy z kluczem anon, który i tak jest w przeglądarce, może słuchać i nadawać na publicznym kanale. Prywatne kanały wymagają reguł RLS na `realtime.messages`, a goście nie mają kont. Trzeba to zaprojektować przy rundzie na żywo, razem z zasadą „nigdy kto na kogo”. Od S-16 kanał niesie obok dzwonka emotkę `{ emote, nick }`, więc kto zna adres pokoju, może nadać emotkę z nickiem gracza tego pokoju; Karol przyjął to 2026-10-26 (`context/archive/2026-10-26-room-emotes/plan.md`). Od `players-only-live-channel` (2026-11-14) emotka idzie osobnym tematem `live-players:<klucz kanału>`: klucz kanału to losowy kod pokoju, który dostają tylko gracze pokoju i który zmienia się przy usunięciu gracza, więc obcy z adresem pokoju i usunięty gracz już jej nie słyszą ani nie podrzucą ekranom; dzwonki zostają na temacie z id pokoju. Gracz pokoju dalej może nadać emotkę z nickiem kolegi: domknie to podpis serwera (W-E, `context/changes/players-only-live-channel/research.md`) przy czacie.
- **Adres gry bierze się z nazwy Workera i subdomeny konta.** `wrangler.jsonc` ma dziś `name: "10x-astro-starter"`, a subdomenę `*.workers.dev` wybiera się raz na konto.
- **`wrangler secret put` od razu tworzy i wdraża nową wersję.** Ustawienie sekretu jest więc wdrożeniem na produkcję.
- **Limit 100 000 żądań dziennie liczy się na konto.** Po jego przekroczeniu Worker do końca doby zwraca błąd 1027 albo jest pomijany. Bot mógłby w ten sposób zablokować wieczór gry.

## Operational Story

- **Preview deploys:**
  - `npx wrangler versions upload` tworzy wersję z własnym adresem podglądu, bez zmiany produkcji.
  - Po podpięciu repo przez Workers Builds każda gałąź inna niż produkcyjna dostaje Preview URL w komentarzu do PR.
  - Podglądy są publiczne, chyba że zabezpieczymy je Cloudflare Access (darmowe do 50 osób według researchu).
- **Secrets:**
  - Lokalnie `SUPABASE_URL` i `SUPABASE_KEY` leżą w `.dev.vars` (plik w `.gitignore`).
  - Na produkcji ustawiamy je przez `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY`. Wartości wpisuje Karol we własnym terminalu, nigdy przez czat.
  - `SUPABASE_KEY` to klucz publiczny anon/publishable, nigdy secret/service_role.
  - Dostęp ma tylko właściciel konta Cloudflare.
  - Od 2026-10-21 repo ma sekrety Actions `SUPABASE_URL` i `SUPABASE_KEY` (tylko klucz publishable) dla workflow `keep-supabase-awake`; dodaje je Karol w ustawieniach repo. Token API Cloudflare trafi do GitHub Secrets dopiero wtedy, gdy wdrażać będzie CI, i ma być zawężony do tego jednego Workera.
- **Rollback:**
  - `npx wrangler deployments list`, potem `npx wrangler rollback [version-id]`. Trwa kilka sekund.
  - Migracje bazy Supabase się nie cofają, można je tylko poprawić kolejną migracją. Zmiany schematu wdrażamy osobno i ostrożnie.
- **Approval:**
  - Tylko człowiek:
    - `wrangler deploy`, `wrangler rollback`, `wrangler versions deploy`;
    - `wrangler secret put/delete`, `wrangler delete`;
    - `supabase db push/reset`;
    - `git push`, jeśli push uruchamia wdrożenie;
    - `npm run keep-awake`, `gh workflow run/enable/disable`, `gh secret`, `gh variable` (od 2026-10-21);
    - domena, DNS i ustawienia kont.
  - Agent sam:
    - `wrangler whoami`, `deployments list`, `versions list`, `tail`, `secret list` (tylko nazwy);
    - lint, `astro check`, build, `astro dev`, smoke.
  - `rollback`, `versions deploy` i `delete` trzeba dopisać do `ask` w `.claude/settings.json` przed pierwszym wdrożeniem.
- **Logs:**
  - `npx wrangler tail <nazwa-workera> --format pretty`, a przy szukaniu błędów z `--status error`.
  - Workers Logs w panelu, bo observability jest włączone w `wrangler.jsonc`.
  - Serwer MCP Observability ewentualnie później.

## Risk Register

| Risk                                                                                                   | Source                        | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ----------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Darmowy Supabase usypia projekt po 7 dniach bez aktywności, więc wieczór gry pada                      | Unknown unknowns / Pre-mortem | H          | H      | Przed pierwszą prawdziwą grą wybrać jedno: ręczne budzenie z checklistą hosta, cykliczne zapytanie (Cron Trigger; najpierw sprawdzić zasady Supabase) albo plan Pro. Rozstrzygnięte 2026-10-21: cykliczne zapytanie, ale z GitHub Actions, nie z Cron Trigger. Workflow `keep-supabase-awake` co 6 h woła w bazie `room_link` ze zmyślonym kodem; czerwony przebieg (i mail z GitHuba) znaczy, że projekt śpi, klucz przestał działać albo zmienił się `room_link`. Zapas: przed wieczorem sprawdzić, czy panel nie pokazuje „Paused” (`deploy-plan.md`, Sytuacje brzegowe). GitHub wyłącza harmonogram po 60 dniach bez aktywności w repo; włącza się go w zakładce Actions |
| Publiczne kanały Realtime: podsłuch, fałszywe zdarzenia, ryzyko ujawnienia „kto na kogo”               | Unknown unknowns / Pre-mortem | M          | H      | Kanał niesie tylko dzwonek `{ seq }`; stan, w tym liczby głosów dopiero przy odsłonie, przychodzi z serwera; fałszywy dzwonek wywoła najwyżej zbędne odświeżenie (F-01). Od S-16 także emotka `{ emote, nick }`: podróbka z nickiem gracza pokoju możliwa, przyjęta decyzją Karola 2026-10-26; ekran pokazuje tylko emotki z listy i nicki swoich graczy. Od `players-only-live-channel` (2026-11-14) emotka idzie tematem z klucza kanału, który znają tylko gracze pokoju i który zmienia się przy usunięciu gracza; podróbkę z nickiem kolegi może nadać już tylko gracz pokoju, do podpisu serwera (W-E) przy czacie                                                     |
| Polecenia zmieniające produkcję bez pytania (`wrangler rollback`, `versions deploy`, `delete`)         | Research finding              | M          | H      | Dopisać je do `ask` w `.claude/settings.json` przed pierwszym wdrożeniem (lekcja z `lessons.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Paczka npm niezgodna z workerd wykłada się dopiero na produkcji; agent pisze `Astro.locals.runtime`    | Devil's advocate              | M          | M      | Przed każdym wdrożeniem `astro dev` (lokalnie w workerd) i `npm run build`; smoke na publicznym adresie; sekrety tylko przez `astro:env/server`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Zepsuty automatyczny deploy tuż przed wieczorem gry                                                    | Pre-mortem                    | M          | M      | Znać `wrangler rollback` przed pierwszą grą; nie wdrażać tuż przed grą; smoke po każdym wdrożeniu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Pomylenie Pages i Workers (materiały kursu, `tech-stack.md`), czyli `wrangler pages`                   | Devil's advocate              | M          | M      | Reguła w `AGENTS.md` już jest; poprawić `tech-stack.md` na Workers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Limit 10 ms CPU przy 20 graczach wracających naraz                                                     | Devil's advocate / Pre-mortem | L          | M      | Po wieczorze testowym `wrangler tail --status error`; przy błędach CPU plan Workers Paid (5 $/mies.) albo lżejszy kod                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Plan B dla rundy na żywo (Durable Objects) to kod tylko pod Cloudflare                                 | Devil's advocate              | L          | M      | Najpierw Supabase Realtime; Durable Objects dopiero wtedy, gdy test z 20 graczami go obali. F-01 (2026-10-04) go nie obalił                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Przekroczenie 100 000 żądań dziennie, czyli błąd 1027 do końca doby                                    | Unknown unknowns              | L          | M      | Przy tej skali nierealne bez bota; w razie potrzeby ograniczenie zapytań (WAF) albo plan płatny                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Adres gry pochodzi od nazwy `10x-astro-starter`                                                        | Unknown unknowns              | H          | L      | Zmienić `name` w `wrangler.jsonc` przed pierwszym wdrożeniem; świadomie wybrać subdomenę `workers.dev`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Code Mode MCP [eksperymentalny]; nowsze „Worker Previews” według researchu w [open beta] od 2026-09-22 | Research finding              | L          | L      | Na MVP wystarczy wrangler; MCP i izolowane podglądy gałęzi nie są potrzebne                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Getting Started

1. **Nazwa Workera.** W `wrangler.jsonc` zmień `"name"` na nazwę gry, np. `most-likely-to`. Pole `main` zostaje `@astrojs/cloudflare/entrypoints/server` (sprawdzone w adapterze 14.3.1).
2. **Logowanie.** `npx wrangler login` (Karol, w przeglądarce), potem `npx wrangler whoami`.
3. **Uruchomienie lokalne.**
   - `SUPABASE_URL` i `SUPABASE_KEY` (anon) wpisz do `.dev.vars`.
   - `npm run dev`: Astro 7 z adapterem 14 uruchamia kod lokalnie w workerd przez `@cloudflare/vite-plugin`, więc `wrangler dev` nie jest potrzebny.
   - Potem `npm run smoke`.
4. **Pierwsze wdrożenie.**
   - `npm run build`, potem `npx wrangler deploy` (ask).
   - Następnie `npx wrangler secret put SUPABASE_URL` i `npx wrangler secret put SUPABASE_KEY`. Każde z nich wdraża nową wersję.
5. **Weryfikacja.** `BASE_URL=https://<nazwa>.<subdomena>.workers.dev npm run smoke` oraz `npx wrangler tail <nazwa>`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
- Projekt rundy na żywo (kanały Supabase Realtime, autoryzacja gości, ewentualne Durable Objects): decyzja przy implementacji

## Sources (checked 2026-09-26)

- Limity Workers: https://developers.cloudflare.com/workers/platform/limits/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Workers zamiast Pages: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/ oraz https://docs.astro.build/en/guides/deploy/cloudflare/
- Durable Objects (cennik): https://developers.cloudflare.com/durable-objects/platform/pricing/
- Usypianie Supabase: https://supabase.com/docs/guides/platform/free-project-pausing
- Autoryzacja Supabase Realtime: https://supabase.com/docs/guides/realtime/authorization
- Vercel (archiwizacja funkcji): https://vercel.com/docs/functions/runtimes
- Render (darmowy plan): https://render.com/docs/free
- Fly.io (trial): https://docs.fly.io/about/free-trial/
- Netlify (kredyty): https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/
- Railway (plany): https://docs.railway.com/pricing/plans
