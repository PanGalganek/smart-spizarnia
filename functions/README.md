# Powiadomienia nawodnienia

Funkcja `sendHydrationReminders` sprawdza co 15 minut cele nawodnienia aktywnych profili i wysyła standardowe powiadomienia Web Push. Do działania, gdy aplikacja jest zamknięta, wymaga wdrożenia Firebase Functions oraz Cloud Scheduler. Cloud Scheduler wymaga projektu Firebase w planie Blaze.

## Konfiguracja

1. W folderze `functions` uruchom `npm install`.
2. Wygeneruj parę VAPID lokalnie: `npx web-push generate-vapid-keys --json`.
3. Wpisz klucz publiczny do pliku `functions/.env.smart-spizarnia` jako `WEB_PUSH_VAPID_PUBLIC_KEY` oraz adres administratora jako `WEB_PUSH_VAPID_SUBJECT=mailto:adres@example.com`.
4. Ustaw klucz prywatny poza kodem: `firebase functions:secrets:set WEB_PUSH_VAPID_PRIVATE_KEY`.
5. Dodaj ten sam klucz publiczny jako sekret GitHub `EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`, aby przycisk w aplikacji mógł zapisać urządzenie.
6. Wdróż funkcję: `firebase deploy --only functions`.

Klucz prywatny VAPID nie może trafić do GitHub Pages, repozytorium ani do aplikacji mobilnej.
