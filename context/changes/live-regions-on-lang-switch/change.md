---
change_id: live-regions-on-lang-switch
title: Czytnik ekranu nie czyta drugi raz komunikatów po przełączeniu języka
status: new
created: 2026-11-27
updated: 2026-11-27
archived_at: null
---

## Notes

Po przełączeniu języka czytnik ekranu nie czyta drugi raz starych komunikatów: PlayerLink („link się zmienił” / „skopiowano”) i RoomChat (ostatnia wiadomość czatu) składają tekst regionu aria-live przy rysowaniu, więc zmiana języka podmienia tekst i czytnik czyta go jako nowość. Wzór poprawki: rola współhosta w RoomScreen (useTextState, zdanie złożone raz, przy zdarzeniu; F3 z context/changes/english-version/reviews/impl-review.md). Lżejszy cykl (same ekrany).
