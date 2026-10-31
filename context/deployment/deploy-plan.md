# Plan pierwszego wdrożenia: Most Likely To na Cloudflare Workers

## Stan po wdrożeniu (26.09.2026)

- **Gra:** https://most-likely-to.charlesonthewave.workers.dev
- **Kod:** https://github.com/CharlesOnTheWave/most-likely-to (publiczne repo), gałąź `main`.
- **Wdrażanie:** każdy push do `main` buduje i wdraża Cloudflare Workers Builds (`npm run build`, potem `npx wrangler deploy`). GitHub Actions (`ci`, `smoke`) tylko sprawdza kod i nie blokuje wdrożenia.
- **Worker `most-likely-to`** na koncie Cloudflare (plan Free), subdomena `charlesonthewave.workers.dev`:
  - sekrety `SUPABASE_URL` i `SUPABASE_KEY` (typ `secret_text`, klucz publishable), wgrane raz przez `npx wrangler deploy --secrets-file .dev.vars`; kolejne wdrożenia ich nie ruszają;
  - powiązania: `ASSETS` (pliki z `dist/client`), `IMAGES`, `SESSION` → KV `most-likely-to-session`. KV utworzył wrangler przy pierwszym wdrożeniu (sesje Astro), a Workers Builds używa tego samego.
- **Supabase:** projekt `most-likely-to` (Frankfurt), jedyny, więc wspólny dla rozwoju i produkcji.
  - → Od 07.10.2026 (S-05, faza 1): Confirm email **włączone** i ma takie zostać (wyłączone pozwala przejąć konto hosta przez logowanie dostawcą). Site URL `https://most-likely-to.charlesonthewave.workers.dev/auth/signin`, Redirect URLs `http://localhost:4321/**` i `http://localhost:4322/**`. W Authentication → Users są tylko 2 konta: Karola i testowe dla smoke (`SMOKE_EMAIL` w `.dev.vars`).
  - → Od 07.10.2026 (S-05, faza 2): Discord i Google włączone (sekcja „Logowanie przez dostawców” niżej). Doszły konta Karola z logowania dostawcą: prywatny Gmail (hasło losowe plus Google) i konto z Discorda. Konto z hasłem na adres z pracy znika po fazie 4 S-05.
  - → 08.10.2026 (S-05, faza 4): konto z hasłem na adres z pracy usunięte. W Authentication → Users są 3 konta: Karola z Discorda, Karola z prywatnym Gmailem (hasło losowe plus Google) i testowe. Na produkcji sprawdzone: smoke z `SMOKE_OAUTH=1` 15/15, logowanie Discordem i Google na laptopie i na Androidzie (także z linku w Discordzie) oraz wygaśnięcie logowania po ponad 300 s z polskim komunikatem. iOS niesprawdzony (`context/changes/one-click-host-login/phone-test.md`).
  - → 27.10.2026 (przegląd S-11): gry konta testowego nie liczą się do `private.question_stats`, bo jego UUID (`d894161a-7308-48d9-984b-17937b1a3013`) jest w `private.stats_excluded_hosts` (migracja `20261026074427`). Konto testowe założone od nowa dostaje nowy UUID: przed pierwszym smoke trzeba nowej migracji, która dopisze go do tej tabeli, inaczej każdy smoke po cichu doliczy się do danych o pytaniach i nie da się go potem odjąć.
- **Wersje:** `c1c7a3b4` (ręczne wdrożenie), `4e3d91b8` (pierwsze z Workers Builds, commit `800c10d`). Próba cofnięcia `4e3d91b8 → c1c7a3b4 → 4e3d91b8` przeszła w kilka sekund.
- **Cofnięcie przy awarii:** `npx wrangler rollback` (ask) wraca do poprzedniej wersji. Nie cofa danych (KV, Supabase), a następny push do `main` znów wdroży najnowszy kod.

## Logowanie przez dostawców (S-05, od 07.10.2026)

Host loguje się Discordem albo Google (`POST /api/auth/oauth` → Supabase → dostawca → `GET /api/auth/callback`). Oba panele dostawców mają jeden adres zwrotny, `https://<ref>.supabase.co/auth/v1/callback` (Supabase pokazuje go w ustawieniach dostawcy jako „Callback URL”). Ten adres obsługuje i rozwój, i produkcję.

- **Discord:** aplikacja „Most Likely To” w Discord Developer Portal na koncie Discord Karola. OAuth2 → Redirects: adres zwrotny jak wyżej. Pola Privacy Policy i ToS są puste.
- **Google:** projekt „Most Likely To” (bez organizacji) na prywatnym koncie Google Karola, które gracze nie widzą. Gmaila gry nie ma, bo Google odrzuciło zakładanie konta. Google Auth Platform:
  - odbiorcy External, tryb Testing: bez publikacji, bez logo i bez listy testerów. Przy samych zakresach `openid`, `userinfo.email` i `userinfo.profile` logować się może każdy, a zgoda nie wygasa po 7 dniach (https://support.google.com/cloud/answer/15549945);
  - „User support email” to grupa Google gry, założona na tym samym koncie. Członków widzi tylko właściciel, a anonimowy gość strony grupy widzi „Content unavailable”. Gracz widzi tylko nazwę gry i adres grupy. Mail na grupę trafia do skrzynki Karola. Graczom odpowiadamy na Discordzie, nie z prywatnej skrzynki, bo odpowiedź ujawniłaby jej adres;
  - „Contact information” to prywatny adres Karola, widoczny tylko dla Google;
  - klient Web application „Supabase” z adresem zwrotnym jak wyżej. Authorized domains są puste, konsola o nie nie prosiła;
  - ekran zgody pokazuje `<ref>.supabase.co` zamiast nazwy gry. To przyjęte ryzyko, bo poprawka wymaga płatnej własnej domeny w Supabase.
- **Supabase** → Authentication → Sign In / Providers: Discord i Google włączone. „Allow users without an email” i „Skip nonce checks” są wyłączone.
- **Sekrety dostawców** są tylko w panelu Supabase: nie w repo, nie w `.dev.vars`, nie w czacie. Wymiana:
  - Discord: OAuth2 → Reset Secret, potem wklejenie w Supabase (Discord);
  - Google: klient „Supabase” → dodanie nowego sekretu, wklejenie w Supabase (Google), potem wyłączenie starego.
- **Po każdej zmianie ustawień dostawcy** (sekret, client id, adres zwrotny) Karol loguje się raz ręcznie na laptopie. Smoke takiej pomyłki nie wykryje, nawet z `SMOKE_OAUTH=1`: Supabase odsyła do dostawcy bez sprawdzania tych wartości, a sekret sprawdza dopiero wymiana kodu po zgodzie.
- **Smoke:** domyślnie sprawdza start logowania (302 do Supabase i ciasteczko PKCE) oraz callback bez kodu i po anulowaniu. `SMOKE_OAUTH=1` idzie jeden skok dalej, do discord.com i accounts.google.com. Wymaga to włączonych dostawców, więc działa tylko na projekcie Supabase, a nie w CI.
  - → 08.10.2026 (przegląd S-05): smoke sprawdza dokładnie ciasteczko `…-auth-token-code-verifier`, bo tylko je czyta callback (auth-js zapisuje je obok ciasteczek na każdy start „w okresie przejściowym”). Ciasteczka sesji i PKCE mają `HttpOnly` (`src/lib/supabase.ts`), a callback przepuszcza tylko krótkie kody błędów (inaczej `unknown`).
- **Rejestracja e-mailem przez API Supabase (przyjęte ryzyko, przegląd S-05, 08.10.2026):** gra nie ma rejestracji, ale Supabase nadal przyjmuje `POST https://<ref>.supabase.co/auth/v1/signup` z kluczem publishable (wysyłanym do przeglądarek dla Realtime), dopóki dostawca Email jest włączony. Jest potrzebny do logowania hasłem konta testowego. Przy „Confirm email” ON takie konto zostaje niepotwierdzone, a domyślna poczta Supabase nie wysyła maili poza zespół, więc nie zaloguje się ani nie przejmie cudzego konta. Przy próbie logowania widzi komunikat „Zaloguj się przez Discord albo Google”. Zamknięcie, gdy będzie potrzebne: hook `before_user_created` odrzucający rejestrację e-mailem albo wyłączenie dostawcy Email po przejściu smoke na inne logowanie.
- **Serwery deweloperskie:** `localhost` tylko na portach 4321 i 4322 (Redirect URLs), `127.0.0.1` na dowolnym porcie. Na innym porcie `localhost` po cichu odeśle logowanie na produkcję. Astro na Windows słucha domyślnie tylko na `[::1]`, więc pod `127.0.0.1` trzeba uruchomić `npm run dev -- --host 127.0.0.1`.
- **Sprawdzone lokalnie 07.10.2026** (faza 2):
  - oba logowania działają na `localhost:4321`, `127.0.0.1:4321` i `localhost:4322`;
  - anulowanie zgody kończy się polskim komunikatem;
  - Google na adres istniejącego konta dołącza się do tego konta;
  - wylogowanie w jednej przeglądarce nie wylogowuje drugiej (`scope: "local"`).
- **Polityka prywatności:** nie ma. To przyjęte ryzyko, bo gra jest na razie tylko dla znajomych. Polityka wraca przed otwarciem gry dla obcych: wymaga jej Discord Developer Policy, a dotyczy też ekranu zgody Google i art. 13 RODO.

## Migracje Supabase (od 07.10.2026, S-01)

- **Połączenie CLI:** Karol raz uruchamia `npx supabase login` i `npx supabase link --project-ref xadljhxjgmckjlmsgmmj` (hasło do bazy wpisuje w podpowiedź, nie w czat). Stan połączenia leży w `supabase/.temp/` (poza gitem) katalogu, w którym je zrobiono, więc każdy worktree i nowy klon łączy się osobno.
  - → 07.10.2026: połączone w worktree S-01 (`C:\Users\karol\10xdevs-room-lobby`). Hasło do bazy nie było potrzebne: CLI 2.117 przy `link`, `db push` i `migration list` tworzy tymczasową rolę logowania przez konto z `supabase login`. Główny katalog `C:\Users\karol\10xdevs` nie jest połączony.
- **Nowa migracja:** `npx supabase migration new <nazwa>`. Zasady dla tabel i funkcji są w `AGENTS.md` (Conventions).
- **Próba przed jedyną bazą:** bez Dockera lokalnie nie ma Postgresa. CI na PR do `main` (`supabase start`) wgrywa migracje na czystą bazę z `auto_expose_new_tables = false` i uruchamia smoke. Push gałęzi nie wdraża produkcji. Workers Builds dla gałęzi jest od 08.10.2026 wyłączony (Etap 6).
- **Wgranie (ask, za zgodą Karola):** `npx supabase db push --dry-run` (lista plików do wgrania), `npx supabase db push`, potem `npx supabase migration list` (kolumny Local i Remote).
- **Nigdy SQL w panelu:** omija historię migracji i psuje następne `db push`. Wgranej migracji nie edytujemy; poprawka i wycofanie to nowa migracja.
- **Zmiana uprawnień w Supabase:** nowe tabele w `public` przestają dostawać uprawnienia dla `anon` i `authenticated` (istniejące projekty od 30.10.2026 według supabase/discussions#45329). Nasze migracje odbierają i nadają uprawnienia jawnie, więc działają przed zmianą i po niej.
- **Wgrane migracje:**
  - `20261007122858_room_lobby` (S-01, 07.10.2026): tabele `rooms`, `players`, `player_secrets` i funkcje `create_room`, `join_room`, `room_link`, `room_lobby`. Przed wgraniem zielone CI na PR #1. Po wgraniu z kluczem publishable: tabele dają 401 `permission denied`, `create_room` jako `anon` też, a funkcje gościa odpowiadają.
    - Advisors → Security po wgraniu: 0 błędów. Ostrzeżenia 0028/0029 dla `join_room`, `room_link` i `room_lobby` są zamierzone (wejście gościa). To samo ostrzeżenie dotyczy `public.rls_auto_enable()`, funkcji Supabase od automatycznego RLS, której nie ma w naszych migracjach. Info „RLS Enabled No Policy” dla `player_secrets` też jest zamierzone. „Leaked Password Protection Disabled” było już wcześniej (ustawienie Auth).
  - `20261022132240_latecomer_admission` (S-08, 22.10.2026): tabela `public.join_requests` dostępna tylko przez funkcje (RLS, bez grantów) i funkcje `request_join`, `join_request_state`, `admit_latecomer`, `reject_latecomer`; `room_lobby` zwraca `requests` (tylko host) i `round.eligible`, a `private.drop_round_state` kasuje prośby przy każdym zamknięciu pokoju. Przed wgraniem zielone CI na PR #14 (`db` z pgTAP 128/128, `e2e`, `smoke`). `db push --dry-run` pokazał tylko tę migrację, a `migration list` po wgraniu ma ją lokalnie i zdalnie. Wgrana przed scaleniem kodu: stary Worker ignoruje nowe klucze `room_lobby`.
    - Advisors → Security po wgraniu: 0 błędów, 23 ostrzeżenia, 6 informacji. Nowe ostrzeżenia są zamierzone, jak dla wcześniejszych funkcji: 0028 i 0029 dla `request_join` i `join_request_state` (wejście spóźnionego bez logowania), 0029 dla `admit_latecomer` i `reject_latecomer` (host sprawdzany w środku funkcji, jak `end_game`). Nowa informacja „RLS Enabled No Policy” dla `join_requests` też jest zamierzona (tabela tylko przez funkcje).
  - `20261027121442_co_host_role` (S-07, 31.10.2026): kolumna `players.cohost`, `private.leader_refusal` (bez grantów), siedem ruchów prowadzącego (`start_game`, `reveal_round`, `next_round`, `skip_round`, `end_game`, `admit_latecomer`, `reject_latecomer`) z `p_player_token default null` i grantem `anon, authenticated`, `set_cohost` (tylko `authenticated`), `room_lobby` z `cohost`, `requests` i `leader_draw` dla prowadzących. Przed wgraniem zielone CI na PR #30 (`ci`, `smoke`, `db` z pgTAP, `e2e`). `db push --dry-run` pokazał tylko tę migrację, a `migration list` po wgraniu ma ją lokalnie i zdalnie. Wgrana przed scaleniem kodu: stary Worker ignoruje nowe klucze, a `p_player_token` ma wartość domyślną.
    - `npx supabase db advisors --linked --type security` po wgraniu: 0 błędów, 38 ostrzeżeń. Nowe są zamierzone: 0028 dla siedmiu ruchów prowadzącego (współhost bez konta, prowadzący sprawdzany w środku funkcji przez `leader_refusal`) i 0029 dla `set_cohost` (host sprawdzany w środku funkcji).
  - `20261031090821_player_color_choice` (S-18, 31.10.2026): kolumna `players.color` (uzupełnienie dzisiejszych kolorów `((seat - 1) % 20 + 20) % 20`, `not null`, `check` 0–19, bez wartości domyślnej), `private.free_color` (bez grantów), `create_room`, `join_room` i `admit_latecomer` z pierwszym wolnym kolorem (sygnatury bez zmian), `set_player_color` (grant `anon, authenticated`), `room_lobby` z `color`. Przed wgraniem zielone CI na PR #32 (`ci`, `smoke`, `db` z pgTAP, `e2e`) i przegląd implementacji APPROVED. `db push --dry-run` pokazał tylko tę migrację, a `migration list` po wgraniu ma ją lokalnie i zdalnie. Wgrana przed scaleniem kodu: stary Worker ignoruje nowy klucz `color`. Potem `npm run smoke` na serwerze dev (nowy kod na produkcyjnej bazie) zielony.
    - `npx supabase db advisors --linked --type security` po wgraniu: 0 błędów, 40 ostrzeżeń. Nowe są zamierzone: 0028 i 0029 dla `set_player_color` (gracz bez konta zmienia swój kolor, host i gość sprawdzani w środku funkcji).

## Context

Lekcja M1L5 kończy moduł 1: gra ma działać pod publicznym adresem.

- **Platforma:** decyzja zapisana w `context/foundation/infrastructure.md` (Cloudflare Workers, 2026-09-26).
- **Stack:** opisany w `context/foundation/tech-stack.md`.

**Stan na start:**

- **GitHub:** konto `CharlesOnTheWave`, jeszcze bez repozytorium gry.
- **Supabase:** projekt `most-likely-to` we Frankfurcie, z automatycznym RLS.
- **Cloudflare:** brak konta.
- **Narzędzia:** brak `gh`, wrangler 4.131.1 jest w projekcie.
- **Repo lokalne:** bez zdalnego repozytorium, a `wrangler.jsonc` ma jeszcze nazwę `10x-astro-starter`.

**Cel:**

- gra działa pod `https://most-likely-to.<subdomena>.workers.dev`;
- logowanie hosta korzysta z produkcyjnego Supabase;
- każdy push do `main` wdraża sam Cloudflare (Workers Builds);
- GitHub Actions tylko sprawdza kod;
- smoke przechodzi na publicznym adresie.

**Zasady obowiązujące w całym planie:**

- Sekrety nigdy nie przechodzą przez czat.
- Polecenia zmieniające produkcję wymagają Twojego „tak”, bo są w regułach ask: `wrangler deploy`, `secret`, `rollback`, `versions deploy`, `delete`, `git push`.
- Hasła, zgody OAuth i instalacje w systemie klikasz Ty. Agent otwiera strony w Chrome i patrzy na zrzuty ekranu.

Właściciel kroku: **Ty** albo **agent**. Zapis „(ask)” oznacza, że Claude Code zapyta Cię o zgodę przed uruchomieniem. Strzałka „→” opisuje, co wydarzyło się naprawdę, gdy różniło się od planu.

## Etap 0. Zapis planu

- [x] **Agent:** po zatwierdzeniu zapisuje ten plan w `context/deployment/deploy-plan.md`.

## Etap 1. Wymagania wstępne: konta i narzędzia

- [x] **Ty:** konto Cloudflare na dash.cloudflare.com/sign-up (plan Free) i potwierdzenie e-maila. Agent otwiera stronę w Chrome.
- [x] **Ty:** w panelu Workers & Pages sprawdź subdomenę `workers.dev` (Your subdomain → Change), np. `charlesonthewave`.
  - Będzie częścią adresu gry, a jej późniejsza zmiana zmienia adresy.
  - Ustawienie jej teraz chroni przed pytaniem wranglera przy pierwszym wdrożeniu.
  - → Cloudflare nadał sam `karol-5bb`; zmieniona na `charlesonthewave`.
- [x] **Ty:** `! npx wrangler login` w Claude Code. Otworzy się przeglądarka, a Ty zatwierdzasz dostęp.
  - → Token OAuth ma szerokie uprawnienia do całego konta (patrz „Decyzje na później”).
- [x] **Agent:** `npx wrangler whoami`, żeby sprawdzić, że to Twoje konto.
- [x] **Agent (po Twojej zgodzie, bo to instalacja programu):** `winget install --id GitHub.cli -e --source winget`. Windows może poprosić o uprawnienia administratora.
  - → Zainstalowany `gh` 2.101.0.
- [x] **Ty, w nowym oknie PowerShell w folderze projektu:** `gh auth login --hostname github.com --git-protocol https --web`. Przepisujesz jednorazowy kod w przeglądarce.
  - Nowe okno jest potrzebne, bo świeżo zainstalowany `gh` nie jest widoczny w już otwartej sesji Claude Code.
  - → Okno z menu Start, nie karta terminala w Devinie (ta też nie widzi nowego `gh`). Na „Authenticate Git with your GitHub credentials?” odpowiedź **n**.
  - → Potrzebne było też uprawnienie `workflow`: `gh auth refresh -h github.com -s workflow`. Bez niego GitHub odrzuca push z `.github/workflows/ci.yml`.
- [x] **Agent:** `gh auth setup-git` i `gh auth status`, wywoływane pełną ścieżką `C:\Program Files\GitHub CLI\gh.exe`, dopóki sesja nie zostanie zrestartowana.
  - → Zamiast `gh auth setup-git`, które zmienia globalną konfigurację gita (także dla innych projektów na komputerze), `gh` jest pomocnikiem logowania tylko w tym repo: `credential.https://github.com.helper` w `.git/config`.
- [x] **Poza planem, przed pierwszym pushem:** mail w commitach.
  - 11 commitów miało mail służbowy, który w publicznym repo byłby widoczny dla każdego.
  - → Repo ma `user.email = 334102526+CharlesOnTheWave@users.noreply.github.com`. Historia przepisana `git filter-branch` (treść i daty bez zmian, nowe hashe). Polecenie uruchomił Karol, bo strażnik trybu auto zablokował je agentowi.
  - → Na GitHubie włączone „Keep my email addresses private” i „Block command line pushes that expose my email”.

## Etap 2. Repozytorium na GitHubie (publiczne)

- [x] **Agent:** `gh repo create CharlesOnTheWave/most-likely-to --public --source . --remote origin`, bez wypychania.
- [x] **Agent (ask):** `git push -u origin main`.
  - Workers Builds nie jest jeszcze podpięty, więc ten push niczego nie wdraża. Uruchamia się tylko CI: lint, `astro check`, build i smoke na lokalnym Supabase w runnerze.
- [x] **Agent:** `gh run list` / `gh run watch`, aż CI będzie zielone. Jeśli padnie, poprawiamy przed wdrożeniem.
  - → Zielone: `ci` 39 s, `smoke` 2 min.

## Etap 3. Supabase: przygotowanie produkcji

- [x] **Ty:** Authentication → Sign In / Providers → Email → wyłącz **Confirm email**.
  - Darmowy serwer pocztowy Supabase wysyła maile tylko do członków zespołu projektu (2 na godzinę, https://supabase.com/docs/guides/auth/auth-smtp), więc obcy host nigdy nie dostałby potwierdzenia.
  - Smoke też wymaga logowania od razu po rejestracji.
  - → Przełącznik jest w sekcji „User Signups” na stronie Sign In / Providers.
  - → 07.10.2026 (S-05): Confirm email z powrotem **włączone**, a smoke loguje się stałym kontem testowym, więc nie potrzebuje już logowania od razu po rejestracji.
- [x] **Agent:** tworzy `.dev.vars` z pustymi liniami `SUPABASE_URL=` i `SUPABASE_KEY=`. Plik jest w `.gitignore`.
- [x] **Ty:** wklejasz do `.dev.vars` dwie wartości, nie do czatu:
  - Project URL;
  - klucz **publishable** z Project Settings → API Keys. Może to być `sb_publishable_…` albo starszy `anon`. **Nigdy** `secret` ani `service_role`.
  - → Adres projektu wpisał agent (nie jest tajny), klucz `sb_publishable_…` wkleił Karol.
- [x] **Agent:** `npm run dev` w tle i `npm run smoke`, czyli pierwszy smoke na prawdziwym Supabase. To domyka zaległość z M1L3.
  - → 8/8. Astro 7 uruchamia serwer deweloperski w tle i od razu kończy polecenie; zatrzymanie: `npx astro dev stop`.

## Etap 4. Zmiany w projekcie

- [x] **Agent:** w `wrangler.jsonc` ustawia `"name": "most-likely-to"`. Od tej nazwy zależy adres gry i musi się ona zgadzać z nazwą Workera w Workers Builds.
- [x] **Agent:** dopisuje do `AGENTS.md` jedną linię: push do `main` wdraża produkcję przez Workers Builds, także wtedy, gdy CI na GitHubie nie przejdzie. Dlatego przed pushem obowiązkowo lint, `astro check` i build, a po wdrożeniu `BASE_URL=<adres> npm run smoke`.
- [x] **Agent:** uruchamia bramkę (`npm run lint`, `npx astro check`, `npm run build`) i robi commit.
  - → Commit `52a4520` (hash po przepisaniu maili).

## Etap 5. Pierwsze wdrożenie z komputera

- [x] **Agent (ask):** `npx wrangler deploy --secrets-file .dev.vars`.
  - Tworzy Workera `most-likely-to` i od razu wgrywa oba sekrety z Twojego pliku. Wartości nie przechodzą przez czat.
  - Sekrety zostają przy kolejnych wdrożeniach, także tych z Workers Builds.
  - → Przed wdrożeniem agent sprawdził, że w `dist/` nie ma `.dev.vars` ani `.env` (dodatkowo wyklucza go `dist/client/.assetsignore`).
  - → Wrangler sam utworzył KV `most-likely-to-session` dla powiązania `SESSION` (sesje Astro). Nie było tego w planie.
- [x] **Agent:** `npx wrangler secret list` (pokazuje tylko nazwy) i `npx wrangler deployments list`.
- [x] **Agent:** `BASE_URL=https://most-likely-to.charlesonthewave.workers.dev npm run smoke`, a przy błędach `npx wrangler tail most-likely-to --format pretty`.
  - → 8/8, bez błędów.
- [x] **Ty:** otwierasz adres na telefonie i sprawdzasz, czy strona główna się ładuje.

## Etap 6. Automatyczne wdrażanie z main (Workers Builds)

- [x] **Ty, w panelu, bo to zgoda OAuth:** Workers & Pages → `most-likely-to` → Settings → Builds → Connect → GitHub.
  - Aplikację Cloudflare instalujesz **tylko dla repo `most-likely-to`**, a nie dla wszystkich repozytoriów. To minimalne uprawnienia.
  - Gałąź produkcyjna `main`, build command `npm run build`, deploy command `npx wrangler deploy` (domyślne).
  - Buildy innych gałęzi włączone (`npx wrangler versions upload`). Od 08.10.2026 wyłączone (niżej).
    - → 08.10.2026: dla gałęzi panel pokazuje deploy command `npx wrangler preview` (Previews), a nie `versions upload`. Buildy gałęzi (`room-lobby`, `one-click-host-login`) padają na ostatnim kroku z błędem `binding SESSION of type kv_namespace must have a namespace_id specified [code: 10021]`. Na `main` `wrangler deploy` sam znajduje KV `most-likely-to-session`, a `wrangler preview` wymaga jego `id` w konfiguracji. Produkcji to nie dotyczy. Check z czasem 0 s to sposób zapisu Cloudflare (także przy sukcesie), a nie natychmiastowa awaria. Do decyzji Karola: wyłączyć buildy gałęzi albo dopisać `id` KV w `wrangler.jsonc`. Podgląd i tak nie ma sekretów Supabase ani swojego adresu w Redirect URLs.
    - → Decyzja 08.10.2026: buildy gałęzi **wyłączone**. Settings → Builds → zakładka „Previews Base” → „Builds for Preview branches” wyłączone; zakładka „Production” bez zmian (`main`, `npx wrangler deploy`). Powód: w module 3 (testy) czerwony check przy PR ma znaczyć „test złapał błąd”, a podgląd bez sekretów Supabase i bez adresu w Redirect URLs i tak nie działał. Na PR zostają `ci` i `smoke` z GitHub Actions. Powrót: włączyć ten przełącznik i dopisać `id` KV `SESSION` w `wrangler.jsonc`.
- [x] **Agent:** robi drobną, bezpieczną zmianę (np. link do gry w `README.md`), commit, potem `git push` (ask).
  - → Commit `800c10d`: adres produkcji w README.
- [x] **Agent:** sprawdza kolejno:
  - CI przez `gh run list`;
  - status buildu Cloudflare w commicie;
  - `npx wrangler deployments list`, gdzie nowe wdrożenie powinno pochodzić z gita;
  - smoke na publicznym adresie.
  - → Wszystko zielone: check „Workers Builds: most-likely-to” = success, CI `ci` 45 s i `smoke` 2 min, smoke na produkcji 8/8. Wdrożenie z Workers Builds ma na liście źródło „Unknown (deployment)”, nie „git”, ale wersję `4e3d91b8` 45 s po pushu.
- [x] **Opcjonalnie, Ty z agentem:** próba cofnięcia. `npx wrangler rollback` (ask) do poprzedniej wersji, sprawdzenie i powrót. Warto przećwiczyć na spokojnie przed pierwszą grą.
  - → `npx wrangler rollback <version-id> --message "…" --yes`: `4e3d91b8 → c1c7a3b4 → 4e3d91b8`, strona odpowiadała cały czas.

## Etap 7. Domknięcie lekcji

- [x] **Agent:** aktualizuje `context/deployment/deploy-plan.md` (odhaczone kroki, adres gry, co zostało), commituje i robi `git push` (ask). Ten push sam wdroży nową wersję, co jest w porządku.
- [x] **Ty:** odbierasz odznakę 1.5 w Mission Log.
  - → Wpis z adresem na Circle (10xDevs Arena) jest opcjonalny. Lekcja mówi tylko: odbierz odznakę, „a następnie pochwal się swoim osiągnięciem”. Karol go pominął.

## Sytuacje brzegowe

- **Wrangler zapyta o subdomenę albo wyświetli inne interaktywne pytanie.** Agent nie odpowie na nie z terminala. Ustawiasz subdomenę w panelu, jeśli trzeba uruchamiasz polecenie sam, i powtarzamy.
- **Build w Cloudflare pada:**
  - sprawdzić, czy nazwa Workera w panelu i `name` w `wrangler.jsonc` są identyczne;
  - sprawdzić wersję Node: `.nvmrc` to 22.14.0, a w razie potrzeby można dodać zmienną builda `NODE_VERSION=22`;
  - **nie** dodawać sekretów Supabase jako zmiennych builda. W `astro:env` są opcjonalne i czytane dopiero w działającej aplikacji.
- **Logowanie na produkcji nie działa:**
  - czy projekt Supabase nie jest uśpiony (panel pokazuje „Paused”) i czy workflow „Keep Supabase awake” w zakładce Actions na GitHubie nie jest wyłączony („Disabled”), a jego ostatni przebieg jest zielony i młodszy niż ok. 12 h (wyłączony harmonogram nie daje czerwonego przebiegu ani maila);
  - czy `SUPABASE_KEY` to klucz publishable/anon;
  - czy konto ma potwierdzony e-mail. Confirm email jest **włączone** od 07.10.2026 (S-05) i ma takie zostać; konto testowe zakłada się z „Auto Confirm User”;
  - podgląd w `npx wrangler tail`.
- **Push odrzucony z komunikatem o `workflow` scope:** `gh auth refresh -h github.com -s workflow` w zwykłym oknie PowerShell.
- **Maile do hostów (linki, potwierdzenia):** wymagają własnego SMTP (np. Resend) oraz ustawienia Site URL i Redirect URLs w Supabase na adres produkcyjny i `http://localhost:4321/**`. To nie jest częścią tego wdrożenia.
  - → 07.10.2026 (S-05): Site URL i Redirect URLs ustawione (wartości w „Stan po wdrożeniu”). Własny SMTP nadal poza planem.
- **Konta testowe:** smoke tworzy konta `smoke-…@example.com` w jedynym projekcie Supabase, który na razie służy i do rozwoju, i do produkcji. To świadomy kompromis na MVP. Konta można usuwać w Authentication → Users.
  - → Od 07.10.2026 (S-05) smoke i sonda F-01 logują się stałym kontem testowym z `.dev.vars` (`SMOKE_EMAIL`, `SMOKE_PASSWORD`) i nie zakładają kont. Stare konta `smoke-…` i `probe-…` usunięte. W nowym worktree trzeba skopiować `.dev.vars`.
- **Paczki kursu w publicznym repo:** `.claude/skills/10x-*` trafiły do publicznego repo. Nie znalazłem w nich zastrzeżeń licencyjnych, a kurs zachęca do publicznego repo.
  - → 23.10.2026 (`course-materials-purge`): pliki kursu poza gitem i w `.gitignore`, blok kursu w `CLAUDE.local.md`; historia do przepisania w fazach 2–5 planu tej zmiany.
  - → 23.10.2026 (`course-materials-purge`): historia przepisana, żaden commit na GitHubie nie zawiera już plików kursu, a `main` ma te same pliki co przed przepisaniem. Stare numery commitów tłumaczy mapa w `context/deployment/history-rewrite-2026-10-22.md`.

## Poza tym planem (decyzje na później)

- Usypianie darmowego Supabase po 7 dniach, czyli ryzyko nr 1 z `infrastructure.md`. Do rozstrzygnięcia przed pierwszym prawdziwym wieczorem gry.
  - → 21.10.2026 (keep-supabase-awake): rozstrzygnięte, opcja 2 z roadmapy (Open Question 9). Workflow „Keep Supabase awake” (`.github/workflows/keep-supabase-awake.yml`) co 6 h (`17 */6 * * *`, UTC) i na żądanie uruchamia `scripts/keep-supabase-awake.mjs`: jedno wywołanie `room_link` ze zmyślonym kodem. Przebieg jest zielony tylko przy HTTP 200 i `status: "unknown"`. Czerwony przebieg (i mail z GitHuba) znaczy, że projekt śpi, klucz przestał działać albo zmienił się `room_link`. Adres i klucz publishable to sekrety Actions repo `SUPABASE_URL` i `SUPABASE_KEY`, dodane przez właściciela w ustawieniach repo. W publicznym repo GitHub wyłącza harmonogram po 60 dniach bez aktywności: włączyć go w zakładce Actions albo `gh workflow enable keep-supabase-awake.yml` (ask). Lokalnie to samo robi `npm run keep-awake` (ask, z `.dev.vars`). Zapas: punkt „Paused” w „Sytuacjach brzegowych”.
  - → 24.10.2026 (impl-review F2): przed każdym prawdziwym wieczorem sprawdzić w zakładce Actions, że workflow „Keep Supabase awake” nie jest „Disabled”, a ostatni przebieg z harmonogramu jest zielony i młodszy niż ok. 12 h. Wyłączenie po 60 dniach bez aktywności w repo jest ciche: nie daje czerwonego przebiegu ani maila.
- Własny SMTP, projekt rundy na żywo (kanały Realtime, goście), własna domena, Cloudflare Access dla podglądów.
- Minimalne uprawnienia: `wrangler login` dał token OAuth z dostępem do całego konta. Docelowo token API ograniczony do Workers tego projektu.
- Wtyczka Cloudflare dla Claude Code (zainstalowana lokalnie, tylko w tym projekcie): po `/reload-plugins` dopisać regułę ask dla serwerów MCP, które mogą zmieniać konto.
- Konta testowe smoke w Supabase (na 26.09: 3) usuwać co jakiś czas.
  - → Nieaktualne od 07.10.2026: smoke nie zakłada już kont (S-05).
- KV na darmowym planie ma niski dzienny limit zapisów. Sprawdzić przed trzymaniem stanu gry w sesjach Astro.
- Ostrzeżenia w GitHub Actions: akcje na Node 20 (`checkout@v4`, `setup-node@v4`, `supabase/setup-cli@v1`) są uruchamiane na Node 24, a `ubuntu-latest` przechodzi na Ubuntu 26 od 19.10.2026. Podbić wersje akcji, gdy wyjdą nowe.
- Ostrzeżenie builda: `@astrojs/sitemap` potrzebuje opcji `site` w `astro.config` (adres produkcji).
- Wrangler 4.141.0 jest dostępny (projekt: 4.131.1).
- Strona wciąż ma szatę startera („10x Astro Starter”); interfejs gry w kolejnych modułach.

## Pliki zmieniane

- `wrangler.jsonc`: pole `name`.
- `AGENTS.md`: linia o wdrożeniach, potem adres produkcji, sekcja Testing i uwaga o `astro dev`.
- `README.md`: adres produkcji (zmiana testowa w Etapie 6).
- `context/deployment/deploy-plan.md`: nowy plik, zaktualizowany po wdrożeniu.
- `.dev.vars`: tylko lokalnie, poza gitem.
- `.git/config` (lokalnie): `user.email` noreply i pomocnik logowania `gh`.

## Weryfikacja end-to-end

1. [x] `npm run lint`, `npx astro check` i `npm run build` przechodzą.
2. [x] Smoke lokalny na produkcyjnym Supabase kończy się „All smoke steps passed”.
3. [x] `npx wrangler deployments list` pokazuje najpierw wdrożenie z komputera, potem z Workers Builds.
4. [x] Smoke na `https://most-likely-to.charlesonthewave.workers.dev` kończy się „All smoke steps passed”.
5. [x] CI na GitHubie i build Cloudflare w commicie są zielone.
6. [x] Na telefonie działa strona główna. Rejestrację i logowanie sprawdził smoke na produkcji.
7. [ ] `npx wrangler tail` nie pokazuje błędów podczas smoke. → Nie uruchamiany; panel Workera pokazuje 0 błędów.
