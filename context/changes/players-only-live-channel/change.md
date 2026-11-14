---
change_id: players-only-live-channel
title: Players only live channel
status: impl_reviewed
created: 2026-11-14
updated: 2026-11-14
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-11-14, decyzje właściciela przed planem (na górze `plan.md`; warianty W-A, W-A′ i W-E w `research.md`): (1) tajny klucz kanału teraz (W-A), podpis serwera na każdej wiadomości (W-E) dopiero przy czacie; (2) W-A′: po kluczu idą tylko emotki, a `bell` i `leader-bell` zostają na `live-sync:<roomId>`, więc ekran czekania spóźnionego i trasy z dzwonkiem bez zmian; (3) powrót na swój nick z innego urządzenia (S-04, `admit_latecomer` z prośbą o powrót) nie zmienia klucza, zmienia go tylko usunięcie gracza; (4) w słowniku „klucz kanału”, osobno od „link do pokoju” i „kod”.
- 2026-11-14, Faza 1 (baza) `c6ab7b0`, draft PR #57; CI zielone (`ci`, `smoke`, `db`, `e2e`), w `db` 18 testów `channel-key.test.ts`, pgTAP 484/484. Właściciel zaakceptował streszczenie migracji (1.4).
- Próbny alarm Fazy 1 (zapisany w rejestrze test-plan §6.2 w Fazie 3): `0bce2e8` z dwoma uszkodzeniami, (a) `remove_player` bez nowego `channel_key`, (b) `room_lobby` z `channel_key` tylko dla prowadzących. Przewidywanie zapisane przed pushem: 6 czerwonych w `channel-key.test.ts`, reszta zielona. Wynik: trafił dokładnie (rotacja przy usunięciu; Ola ×3; Ola po usunięciu; nowa przeglądarka Bartka), pozostałe 18 plików `db`, pgTAP 484/484, `ci`, `smoke`, `e2e` zielone; recenzja AI `fail` (widziała uszkodzenia, poza bramką). Revert `d4e57a0`.
- 2026-11-14, Faza 2 (Worker i ekrany) `4258b11` w PR #57; CI zielone (`ci`, `smoke` z 2 nowymi krokami klucza, `db`, `e2e` 35/35, `players-channel.spec.ts` za pierwszym razem, 19 s); zrzuty podglądów przed/po zaakceptowane (2.4). Wyjątek w `eslint.config.js` dla surowego klienta Realtime w `tests/e2e/support/live.ts` (odmawia nielokalnego adresu i niepublicznego klucza).
- Próbny alarm Fazy 2 (zapisany w rejestrze test-plan §6.4 w Fazie 3): efekt emotek w `useRoomState.ts` bez `channelKey` w zależnościach, więc ekran zostaje na kluczu z pierwszego widoku. Przewidywanie zapisane przed pushem: w `e2e` czerwony tylko `players-channel.spec.ts`, na czekaniu kroku 4 „the host's screen joined the players' topic of the new key (K2)”, w 3 próbach z 3 (CI ma 2 powtórki); reszta `e2e` zielona (`emotes.spec.ts` też, klucz się tam nie zmienia); `ci` zielone (lint daje tylko ostrzeżenie `exhaustive-deps`), `smoke`, `db` zielone. Alarm `a0f6cd8` (z `eslint-disable-next-line`, więc lint bez ostrzeżenia). Wynik: trafił dokładnie, czerwony tylko `players-channel.spec.ts` na „the host's screen joined the players' topic of the new key (K2)”, 3/3 próby; 34 pozostałe testy `e2e`, `ci`, `smoke`, `db` zielone; recenzja AI `fail` (widziała uszkodzenie, poza bramką). Revert `2900704`.
- Sign-up limit: z `channel-key` (2 hosty: drugi tylko do odczytu REST cudzego pokoju) jeden przebieg `db` zakłada 25 kont z 30 (wcześniej 23); test-plan §6.2 „Sign-up limit” poprawiony w Fazie 3 (2026-11-14).
