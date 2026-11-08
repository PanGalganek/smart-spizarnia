# Smart Spizarnia

Tabletowa aplikacja mobilna do zarzadzania domowa spizarnia. Projekt jest podzielony na niezalezne moduly: Skaner, Spizarnia, Posilki i Zapisane.

## Technologia

- Expo, React Native i TypeScript
- Firebase Authentication i Cloud Firestore
- Open Food Facts API
- Expo Router

## Uruchomienie

1. Zainstaluj Node.js LTS i Git.
2. Skopiuj `.env.example` do `.env` i uzupelnij dane projektu Firebase.
3. W Firebase wlacz logowanie Email/Password. Konto administratora musi odpowiadac `ADMIN_UID` w `src/services/userData.ts` i `adminUid()` w `firestore.rules`.
4. Utworz baze Firestore i opublikuj reguly z `firestore.rules`.
5. Uruchom `npm ci --legacy-peer-deps`, a potem `npm run android`.

## Struktura projektu

- `app/` - routing i wejscia ekranow
- `src/features/scanner/` - aparat, kody kreskowe i Open Food Facts
- `src/features/pantry/` - aktualny stan produktow
- `src/features/meals/` - kreator i historia posilkow
- `src/features/saved/` - katalog zapisanych produktow
- `src/services/` - komunikacja z Firebase i zewnetrznym API
- `src/domain/` - wspolne modele danych
- `src/core/` - logowanie, wyglad i wspolne komponenty

## Kolekcje Firestore

- `userProfiles/{uid}` - rola konta i status: pending, active lub blocked
- `users/{uid}/products/{barcode}` - dane produktu z API lub wpisane recznie
- `users/{uid}/pantry/{barcode}` - ilosc, opakowania z datami waznosci, lokalizacja i status
- `users/{uid}/meals/{mealId}` - posilek, skladniki, osoba i podsumowanie odzywcze
- `users/{uid}/dailySummaries/{YYYY-MM-DD}__{consumerId}` - dzienna suma kcal, makro i liczba posilkow osoby
- `users/{uid}/mealTemplates`, `shoppingList`, `consumers`, `settings` - szablony, zakupy, osoby i ustawienia

Nowe konta moga sie rejestrowac, ale otrzymuja status `pending` i wymagaja aktywacji przez administratora. Aktywny uzytkownik ma dostep do swoich danych; administrator ma dostep do danych wszystkich kont. Kolekcje bez prefiksu `users/{uid}` sa starszym formatem, dostepnym tylko do odczytu przez administratora na potrzeby migracji.

Utworzenie posilku, odjecie wszystkich skladnikow i aktualizacja podsumowania dnia sa jedna transakcja Firestore. Cofniecie posilku atomowo przywraca te same ilosci i odejmuje wartosci posilku od podsumowania dnia.

Cofniecie odczytuje aktualny posilek w transakcji. Ponowna proba cofniecia usunietego wpisu nie zmienia zapasow ani kalorii. Edycja lokalizacji i dat nie nadpisuje ilosci ze starego widoku; zakup dopisuje opakowania z zachowaniem dotychczasowych dat i stanu otwarcia.

Nowe posilki zapisuja w skladnikach `consumedPackages`: identyfikator, zuzyta ilosc, pojemnosc i metadane kazdego opakowania. Cofniecie zwraca ilosci do tych samych opakowan, odtwarza calkowicie zuzyte opakowania z ich datami i zachowuje pozniejsze zakupy oraz zmiany dat istniejacych opakowan. Starsze posilki bez tej historii nadal zwracaja tylko ilosc. Usuniecie calego produktu ze spizarni lub zmiana jednostki blokuje zwrot skladnika; nadal mozna usunac sam wpis z historii.

Kolejnosc zuzycia: recznie wskazane opakowanie, opakowania otwarte, najblizszy termin waznosci, najstarsze dodanie. Opakowania bez daty sa na koncu swojej grupy. Podsumowanie zapasu korzysta z tej samej kolejnosci co zuzycie.

## Licznik kalorii i posilki

Produkty moga byc przechowywane w gramach, mililitrach albo sztukach. Kazdy wpis spizarni zawiera ilosc, jednostke, termin waznosci, lokalizacje i status. Dane odzywcze pochodza z Open Food Facts albo sa uzupelniane recznie.

Kreator posilkow wybiera produkty bezposrednio ze spizarni, blokuje ilosc wieksza od dostepnej i na zywo sumuje kcal, bialko, tluszcz oraz weglowodany. Dla produktu liczonego na 100 g uzycie jednostki `szt` wymaga podania rzeczywistej masy jednej sztuki.

Ekran Posilki pokazuje dzienna sume kalorii, makro i pozostale skladniki odzywcze oraz historie posilkow. Cofniecie posilku przywraca wykorzystane ilosci do spizarni, a usuniecie wpisu porzadkuje historie bez zmiany stanu spizarni.

## Weryfikacja

Uruchom `npm test`, `npm run typecheck` oraz testowe pakowanie Expo dla platform `web` i `android`. Testy obejmuja obliczenia kcal, jednostki, odejmowanie stanu, blokowanie nadmiernego zuzycia, oznaczenie produktu jako zuzyty, cofanie posilku i brak danych kalorycznych.

Do testow na fizycznym tablecie pozostaja aparat, ergonomia dotykowa oraz zachowanie przy chwilowej utracie sieci.

Testy repozytoriow korzystaja z pamieciowego modelu dokumentow, wersji i atomowych transakcji. Obejmuja ponawianie cofniecia, konflikty rownoleglych operacji, edycje metadanych i zachowanie opakowan przy zakupie.

`npm run test:rules` uruchamia oficjalny emulator Firestore i osobny zestaw testow dostepu oraz walidacji danych. Wymaga Node.js 22 i Java 21 dostepnych w PATH. Projekt testowy `demo-smart-spizarnia` i host lokalny sa zapisane na stale; testy nie wymagaja logowania Firebase ani danych prawdziwego projektu. Testy obejmuja izolacje kont, blokade administratora, rejestracje pending, eskalacje roli, operacje na starszych danych, chronione osoby oraz przykladowe transakcje posilkow. CI uruchamia je przy pull requestach i przed publikacja GitHub Pages wraz z testami jednostkowymi i kontrola typow.

## Zakres ochrony danych

Uprawnienia administratora wymagaja aktywnego profilu z rola `admin`, takze dla `ADMIN_UID`. Ten identyfikator pozwala jedynie utworzyc wlasny pierwszy profil administratora; istniejacego zablokowanego profilu nie mozna w ten sposob odblokowac. Profil konta jest powiazany z identyfikatorem dokumentu, a adres przy samodzielnej rejestracji musi odpowiadac zalogowanemu kontu.

Reguly sprawdzaja identyfikatory dokumentow, dozwolone pola, typy, nieujemne i skonczone ilosci, mapy wartosci odzywczych produktow i podsumowan oraz zakres porcji 1-100. Obowiazuja limity: 50 skladnikow posilku lub szablonu, 1000 opakowan, 100 lokalizacji, 200 znakow nazwy/identyfikatora i 2000 znakow opcjonalnego tekstu. Daty sa sprawdzane pod katem formatu oraz zakresu miesiaca i dnia, nie pelnego kalendarza. Starsze dokumenty niezgodne z nowymi wymaganiami trzeba poprawic przed ich kolejnym zapisem lub migracja; odczyt pozostaje dostepny zgodnie z uprawnieniami.

Reguly nie sprawdzaja kazdego elementu list `ingredients`, `packages`, `consumedPackages` i `values` ani nie przeliczaja ich sum. Walidacja calej transakcji biznesowej (np. zgodnosc kalorii ze skladnikami i zapasu z opakowaniami) pozostaje po stronie aplikacji. Aktywny wlasciciel nadal moze edytowac wlasne dane bezposrednim zadaniem. Pelne wymuszenie tych zaleznosci wymaga osobnej zmiany modelu danych lub zaufanej uslugi serwerowej; obecny pakiet nie daje takiej gwarancji. Ograniczenia walidacji list opisuje [dokumentacja Firebase](https://firebase.google.com/docs/firestore/security/rules-fields#enforcing_field_types).

Sama publikacja aplikacji w GitHub Pages nie wdraza `firestore.rules`. Zmiana reguł w rzeczywistym projekcie Firebase to osobny krok po przejrzeniu zgodnosci istniejacych danych. Testy lokalne nie zmieniaja produkcyjnej bazy.
