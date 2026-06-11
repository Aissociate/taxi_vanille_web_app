# Audit du code & plan de tests fonctionnels — Taxi Vanille

*Audit du 11/06/2026 — couvre `web/` (admin React+Supabase), `mobile/` (app chauffeur Capacitor/Android) et `supabase/migrations/` (48 migrations).*

---

## 1. Vue d'ensemble

| Partie | Contenu |
|---|---|
| **Web admin** | Planning (jour/semaine/mois, duplication, remplacement, brouillon, astreintes), Facturation (kanban brouillon→validée→payée, calcul tarifs par plages, avances), Dashboard KPI, Clients, Chauffeurs (détail, documents, avances), Incidents, Logs (avec undo), Trafic, Carte GPS, Rapports client (ReportWizard), Paramètres (lignes/arrêts, tarifs, jours fériés, alertes, IA, utilisateurs) |
| **Mobile chauffeur** | Login code+PIN, planning du jour, exécution course (départ→arrivée, passagers, GPS 60 s), astreintes avec GPS, incidents (photo/vidéo/audio), kilométrage début/fin de mois, mode coordinateur, file offline |
| **Base Supabase** | ~25 tables, triggers d'audit automatiques sur 20 tables, RLS avec de nombreuses policies `anon` |

---

## 2. Constats d'audit

### 2.1 Sécurité — CRITIQUE

| # | Constat | Localisation | Impact |
|---|---|---|---|
| S1 | **Tables lisibles/modifiables avec la seule clé anon** : `chauffeurs` (identité, téléphone, SIRET, **PIN**), `courses` (SELECT/INSERT/UPDATE), `gps_pings` (positions temps réel), `incidents` (photos+GPS), `course_executions`, `arret_executions`, `kilometrage`. La migration `20260521124815_fix_security_issues.sql` ne corrige que partiellement (resserre les INSERT mais laisse les SELECT `USING (true)`). | `supabase/migrations/2026051822*` → `20260519*` | N'importe qui avec la clé anon (visible dans le bundle JS) peut suivre les chauffeurs en direct, lire leurs données personnelles et modifier des courses |
| S2 | **PIN chauffeur stocké et comparé en clair**, login mobile par `select('*').eq('code', …).eq('pin', …)` : le PIN voyage et revient au client, PIN 4 chiffres, **aucun rate limiting** (soumission auto au 4ᵉ chiffre) | `mobile/src/pages/LoginPage.tsx:50-61`, `web/src/mobile/pages/MobileLoginPage.tsx:60` | Brute force trivial (10 000 combinaisons), fuite des PIN si la base ou une réponse réseau est exposée |
| S3 | **Aucune gestion de rôles côté web** : le signup est ouvert (`LoginPage.tsx`) et tout compte authentifié accède à toutes les pages (Utilisateurs, Tarifs, IA…) — pas de `role` dans `user_metadata`, pas de garde dans `App.tsx` | `web/src/App.tsx`, `web/src/hooks/useAuth.ts`, `web/src/pages/settings/UsersPage.tsx:72` | N'importe qui peut créer un compte et devenir « admin » de fait |
| S4 | **Clé API OpenRouter en clair dans localStorage** | `web/src/pages/settings/IAPromptsPage.tsx` | Vol de clé via XSS ou accès au poste |
| S5 | **PIN par défaut « 1234 »** à la création d'un chauffeur, sans obligation de changement | `web/src/components/chauffeurs/ChauffeurForm.tsx:65` | Comptes chauffeurs prévisibles |
| S6 | **Screenshot de bug** capture tout l'écran (données sensibles) et stocke le PNG base64 directement en base | `web/src/components/BugReportButton.tsx` | Fuite de données + gonflement de la base |
| S7 | Session mobile stockée 12 h en localStorage non chiffré, sans refresh ni invalidation serveur | `mobile/src/lib/store.ts:5` | Session rejouable, déconnexion forcée en pleine course après 12 h |

### 2.2 Permissions Android — BLOQUANT (vérifié)

`mobile/android/app/src/main/AndroidManifest.xml` ne déclare **que** `INTERNET`. Il manque :
- `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` → le tracking GPS des courses et astreintes échouera sur l'APK natif ;
- `RECORD_AUDIO` → l'enregistrement vocal d'incident échouera ;
- `CAMERA` (si capture via plugin).

### 2.3 Bugs métier

| # | Constat | Localisation | Impact |
|---|---|---|---|
| M1 | **Plages horaires comparées en chaînes de caractères** : une plage traversant minuit (ex. 21:00→05:00) ne matche jamais (`'22:30' < '05:00'` est faux). *Note : FacturationPage gère correctement ce cas (`findPlageForTime`, lignes 468-479) ; le bug subsiste dans le détail chauffeur.* | `web/src/components/chauffeurs/ChauffeurDetail.tsx:273` | KPI « CA projeté » du chauffeur faux pour les courses de nuit |
| M2 | **Médias d'incident perdus en mode offline** : l'incident est mis en file avec `photo_url/audio_url/video_url = null` et aucun mécanisme ne re-tente l'upload au retour du réseau | `mobile/src/components/IncidentSheet.tsx` (branche offline) | Perte de preuves (accident, sécurité) |
| M3 | **File offline sans transaction ni déduplication** : échec partiel → opérations dépendantes exécutées quand même (incident orphelin, course à moitié créée) ; double-clic → opération dupliquée ; pas de gestion du localStorage plein | `mobile/src/lib/offlineQueue.ts:47-74` | Corruption de données après reconnexion |
| M4 | **KPI « ponctualité » faux** : calculé sur `duree_minutes > 10` (durée de la course), pas sur un retard réel | `web/src/pages/DashboardPage.tsx:163-165` | Indicateur trompeur |
| M5 | **Remplacement coordinateur** : un chauffeur ayant *une* course dans la journée est considéré occupé *toute* la journée (pas de test de chevauchement horaire) ; la course de remplacement est créée avec `statut_realisation: 'en_cours'` au lieu de `programme` | `mobile/src/pages/CoordinatorPage.tsx:180-235` | Remplacements impossibles ou statuts incohérents |
| M6 | **Triple statut de course** (`statut` legacy, `statut_planification`, `statut_realisation`) avec trigger de sync au mapping incomplet (`annulee`→`incident` non documenté, défaut `en_cours` à la création) | `supabase/migrations/20260519005850`, `20260518224419` | Web et mobile peuvent afficher des statuts différents pour la même course |
| M7 | **Rapport client** : 40 usagers/trajet codé en dur, taux de fréquentation PM calculé avec la capacité du matin, durée = durée planifiée et non réelle | `web/src/components/ReportWizard.tsx:193-257` | Rapports clients statistiquement faux |
| M8 | **Remboursement d'avances sans transaction** lors du passage « payée » : deux factures traitées en parallèle peuvent imputer la même avance deux fois | `web/src/pages/FacturationPage.tsx:151-173` | Erreur de paie chauffeur |
| M9 | **Dépassement km** : si `km_fin < km_début` (erreur de saisie, compteur changé) le calcul est silencieusement plafonné à 0, aucune alerte de cohérence ; côté mobile, saisie de 0 km impossible (`!km` rejette 0) | `FacturationPage.tsx:596-598`, `mobile/src/components/KilometrageScreen.tsx:27-31` | Facturation fausse, chauffeur bloqué |
| M10 | **Dates/fuseaux** : construction manuelle de timestamps ISO (`toLocalDateTimeStrTz`), comparaisons `isSameDay` sans normalisation, duplication de courses sur plusieurs jours en batch sans transaction | `web/src/pages/PlanningPage.tsx:76-112, 311-386` | Courses décalées d'une heure (DST) ou créées partiellement |
| M11 | **Undo des logs** : la restauration d'un DELETE ré-insère avec le `user_id` courant et un nouvel id (casse les FK) ; pas de verrou contre le double-undo | `web/src/pages/LogsPage.tsx:86-114` | Restauration corrompue |
| M12 | **Pas d'unicité facture** (chauffeur + mois), pas de CHECK sur les statuts, pas de contrainte anti-chevauchement d'astreintes, `gps_pings` sans CHECK `course_execution_id XOR astreinte_session_id` | migrations diverses | Doublons et incohérences possibles en base |

### 2.4 Fiabilité / robustesse

- Timers et intervalles GPS non protégés contre le double démarrage ([CourseDetailPage.tsx:120-161](mobile/src/pages/CourseDetailPage.tsx:120), [PlanningPage.tsx:94-140](mobile/src/pages/PlanningPage.tsx:94)) → pings dupliqués, fuites mémoire.
- `navigate('/planning')` après « Terminer » sans vérifier le succès des écritures ([CourseDetailPage.tsx:237-276](mobile/src/pages/CourseDetailPage.tsx:237)).
- Permission GPS demandée *après* le départ de la course, refus silencieux → course sans aucun tracking.
- Nombreux formulaires admin sans validation (montants négatifs acceptés dans Tarifs, SIRET non validé, chevauchement de plages horaires non détecté, sauvegarde « debounced » 600 ms perdue si fermeture de l'onglet — [TarifsPage.tsx:87-132](web/src/pages/settings/TarifsPage.tsx:87)).
- Compteur passagers : descendants > montants possible, aucun plafond ([CourseDetailPage.tsx:437](mobile/src/pages/CourseDetailPage.tsx:437)).

---

## 3. Liste de tests fonctionnels

Convention : chaque test = précondition → action → **résultat attendu**. Priorité : 🔴 bloquant, 🟠 important, 🟡 secondaire.

### A. Authentification web (admin)

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| A1 | 🔴 | Se connecter avec un compte admin valide | Accès au dashboard, session persistante après F5 |
| A2 | 🔴 | Créer un compte via le formulaire d'inscription, puis naviguer vers Paramètres → Utilisateurs / Tarifs | **L'accès devrait être refusé** (aujourd'hui : accès total — faille S3) |
| A3 | 🟠 | 20 tentatives de connexion erronées d'affilée | Blocage ou délai progressif (rate limiting) |
| A4 | 🟠 | Se déconnecter via la sidebar puis utiliser le bouton « précédent » du navigateur | Retour à l'écran de login, aucune donnée affichée |
| A5 | 🟡 | Mot de passe < 6 caractères à l'inscription | Refus avec message clair |

### B. Authentification mobile (chauffeur / coordinateur)

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| B1 | 🔴 | Login chauffeur avec code + PIN corrects | Arrivée sur le planning du jour |
| B2 | 🔴 | Login coordinateur (code + `pin_android`, `is_coordinateur=true`) | Arrivée sur l'écran coordinateur |
| B3 | 🔴 | 10+ PIN erronés successifs sur un même code | Verrouillage temporaire du compte (aujourd'hui : aucun — faille S2) |
| B4 | 🟠 | Chauffeur inactif (statut désactivé dans l'admin) tente de se connecter | Connexion refusée avec message explicite |
| B5 | 🟠 | Session ouverte depuis plus de 12 h, app rouverte en pleine course | Comportement défini (re-login sans perte de la course en cours) |
| B6 | 🟡 | Code saisi en minuscules (`t1` au lieu de `T1`) | Login accepté (normalisation uppercase) |

### C. Planning web

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| C1 | 🔴 | Créer une course (ligne, chauffeur, date/heure, départ/arrivée parmi les arrêts de la ligne) | Course visible dans les vues jour/semaine/mois et dans le planning mobile du chauffeur |
| C2 | 🔴 | Créer une course en **mode brouillon** | Invisible côté mobile ; visible (badge brouillon) côté admin ; publication → apparaît sur mobile |
| C3 | 🔴 | Dupliquer une course sur 7 jours incluant un jour férié paramétré | Courses créées aux **mêmes heures locales**, jour férié exclu (ou inclus selon l'option choisie) |
| C4 | 🔴 | Dupliquer une course du 31/12 sur la semaine suivante (changement d'année) et pendant un changement d'heure été/hiver | Dates et heures exactes, pas de décalage d'une heure |
| C5 | 🔴 | Remplacer le chauffeur d'une course | Course originale marquée `remplace`, nouvelle course créée pour le remplaçant, les deux cohérentes côté mobile |
| C6 | 🟠 | Modifier la durée d'une course par drag sur la timeline | Durée sauvegardée, pas d'écrasement si la page se rafraîchit pendant le drag |
| C7 | 🟠 | Supprimer une course déjà commencée par un chauffeur (exécution en cours) | Refus ou avertissement (pas d'exécution orpheline) |
| C8 | 🟠 | Interrompre une duplication en masse (fermer l'onglet à mi-chemin) | Soit tout est créé, soit rien (aujourd'hui : création partielle — M10) |
| C9 | 🟡 | Filtres ligne/chauffeur/période (matin, après-midi, astreinte) | Résultats exacts, combinables |
| C10 | 🟡 | Créer une course à 23h30 puis la consulter le lendemain | Apparaît bien sur le bon jour dans toutes les vues |

### D. Exécution de course (mobile)

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| D1 | 🔴 | Cycle nominal complet : ouvrir la course → valider le départ (passagers montants) → valider l'arrivée (descendants) → terminer | `course_executions` + `arret_executions` créés, `statut='terminee'` ET `statut_realisation='termine'`, heures début/fin correctes, retour au planning |
| D2 | 🔴 | Pendant la course, vérifier les `gps_pings` | 1 ping/60 s environ, rattachés à la bonne exécution, **aucun doublon** |
| D3 | 🔴 | Refuser la permission GPS au moment du départ | Message clair au chauffeur ; la course reste utilisable ; l'absence de tracking est signalée (aujourd'hui : échec silencieux) |
| D4 | 🔴 | Statut affiché côté admin pendant l'exécution | Admin (Planning/Dashboard) et mobile affichent le **même** statut à chaque étape (bug M6 à surveiller) |
| D5 | 🟠 | Saisir 10 descendants pour 5 montants | Avertissement ou blocage (aujourd'hui : « -5 » accepté) |
| D6 | 🟠 | Double-tap rapide sur « Valider le départ » | Une seule exécution créée, un seul timer/GPS |
| D7 | 🟠 | Course démarrée avec >10 min de retard | Statut « en retard » correctement calculé et visible côté coordinateur |
| D8 | 🟠 | Couper le réseau juste avant « Terminer », appuyer, puis vérifier | Retour planning + opération en file ; au retour réseau, la course passe bien à terminée (aucune perte) |
| D9 | 🟡 | Saisir 999 passagers | Plafond ou avertissement (capacité véhicule) |

### E. Mode offline (mobile)

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| E1 | 🔴 | Mode avion → exécuter une course complète → réseau rétabli | Bannière offline pendant, compteur d'opérations en attente, sync complète et **dans l'ordre** (exécution avant updates), aucune donnée orpheline |
| E2 | 🔴 | Offline : déclarer un incident **avec photo et audio** → retour réseau | Incident synchronisé **avec ses médias** (aujourd'hui : médias perdus — M2, bloquant) |
| E3 | 🔴 | Offline : une opération de la file échoue à la sync (ex. course supprimée entre-temps) | Les opérations dépendantes ne sont pas exécutées ; l'échec est visible (aujourd'hui : silencieux — M3) |
| E4 | 🟠 | Terminer la même course 2× pendant l'offline (double-clic) | Une seule mise à jour appliquée à la sync (déduplication) |
| E5 | 🟠 | Rester offline plusieurs heures avec GPS actif (centaines de pings) | Pas de saturation localStorage, pas de perte de file |
| E6 | 🟠 | Réseau instable (online/offline en boucle pendant une sync) | Pas d'opérations exécutées en double |
| E7 | 🟡 | Bannière offline : compteur et message « X opérations synchronisées » | Affichage exact, ne masque pas le contenu cliquable |

### F. Incidents

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| F1 | 🔴 | Déclarer un incident (type + description + photo) en ligne | Visible immédiatement côté admin (IncidentsPage) et coordinateur, avec photo, GPS et chauffeur |
| F2 | 🔴 | Enregistrement vocal de 60 s | Arrêt automatique à 60 s, fichier lisible côté admin |
| F3 | 🟠 | Refuser la permission micro | Message explicite, pas de blocage de l'écran |
| F4 | 🟠 | Traiter un incident côté admin (mesure prise) | Incident passe en « traité », `coordinateur_id` et `handled_at` renseignés, visible côté mobile coordinateur |
| F5 | 🟠 | Joindre un fichier non-image (ex. .exe renommé) | Rejet (validation type/taille — aujourd'hui absente) |
| F6 | 🟡 | Incident sans course liée (hors service) | Création acceptée et affichage correct |

### G. Astreintes

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| G1 | 🔴 | Démarrer puis terminer une astreinte côté mobile | Session créée avec heure_début/fin, pings GPS toutes les 60 s pendant la session uniquement |
| G2 | 🔴 | Basculer offline/online pendant une astreinte active | Pas de pings dupliqués, timer d'affichage cohérent |
| G3 | 🟠 | Créer 2 astreintes qui se chevauchent pour le même chauffeur (admin) | Détection/refus du chevauchement (aujourd'hui : aucune contrainte — M12) |
| G4 | 🟠 | Astreinte se terminant exactement à minuit / à l'heure de début d'affichage du planning | Apparaît correctement dans la vue planning (bug de borne signalé) |
| G5 | 🟡 | Heures d'astreinte dans le détail chauffeur | Total d'heures exact ; une session avec fin < début doit être signalée, pas ignorée |

### H. Kilométrage

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| H1 | 🔴 | Saisie km début de mois (écran bloquant à la connexion) | Enregistré une seule fois (contrainte unique), écran ne réapparaît plus |
| H2 | 🔴 | Saisie km fin de mois dans la fenêtre des 2 derniers jours | Demandée au bon moment ; définir le comportement si le chauffeur ne saisit pas avant le 1ᵉʳ |
| H3 | 🟠 | Saisir un km **inférieur** au mois précédent | Avertissement de cohérence (aujourd'hui : accepté silencieusement — M9) |
| H4 | 🟠 | Double-validation rapide | Un seul enregistrement (erreur 23505 gérée proprement) |
| H5 | 🟡 | Saisir 0 km (véhicule neuf) | Accepté (aujourd'hui : rejeté par `!km`) |

### I. Facturation

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| I1 | 🔴 | Générer une facture pour un chauffeur avec des courses jour/nuit/samedi/dimanche/astreinte/non-planifiées sur le mois | Chaque course classée dans la bonne catégorie avec le **tarif de sa plage horaire** ; vérifier spécifiquement une course à 22h30 sur une plage 21:00→05:00 |
| I2 | 🔴 | Workflow kanban : brouillon → validée → payée | Transitions correctes, montants figés à la validation |
| I3 | 🔴 | Passage en « payée » avec avances en cours | Avances imputées une seule fois, `solde_avance_avant/apres` corrects ; tester 2 factures payées quasi simultanément (M8) |
| I4 | 🔴 | Dépassement kilométrique | `(km_fin − km_début − seuil) × tarif` exact ; si km_fin < km_début → alerte, pas un 0 silencieux |
| I5 | 🟠 | Générer 2 factures pour le même chauffeur et le même mois | Refus ou avertissement (aujourd'hui : doublon possible — M12) |
| I6 | 🟠 | Modifier la grille tarifaire puis recalculer une facture en brouillon | Nouveaux tarifs appliqués ; une facture validée ne change pas |
| I7 | 🟠 | Ajouter/supprimer des lignes supplémentaires (frais, remboursements) | Sous-total, TTC et net à payer recalculés correctement |
| I8 | 🟠 | Chauffeur sans aucune course terminée sur le mois | Facture à 0 cohérente (location/frais fixes seulement) ou refus |
| I9 | 🟡 | Courses `remplace` ou `annule` dans le mois | Exclues du décompte facturé |

### J. Paramètres (tarifs, lignes, jours fériés, utilisateurs)

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| J1 | 🔴 | Créer une ligne avec ses arrêts (GPS, ordre) puis l'utiliser dans une course | Arrêts proposés comme départ/arrivée dans le planning et affichés sur mobile dans le bon ordre |
| J2 | 🔴 | Supprimer une ligne référencée par des courses et chauffeurs | Avertissement clair sur la cascade ; pas de courses orphelines invisibles |
| J3 | 🔴 | Saisir un tarif négatif ou des plages horaires qui se chevauchent | Rejet avec message (aujourd'hui : accepté — validation absente) |
| J4 | 🟠 | Modifier un tarif puis fermer l'onglet immédiatement (< 600 ms) | La modification n'est pas perdue, ou un indicateur « non sauvegardé » est affiché |
| J5 | 🟠 | Jour férié « annuel » (récurrent) | Pris en compte chaque année dans la duplication planning et la tarification « fériés » |
| J6 | 🟠 | Créer un chauffeur sans changer le PIN par défaut | Avertissement / obligation de changer « 1234 » (S5) |
| J7 | 🟡 | Changer le mot de passe d'un autre utilisateur en tant qu'admin | Comportement défini (aujourd'hui : impossible, message d'erreur confus) |

### K. Mode coordinateur

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| K1 | 🔴 | Remplacer le chauffeur d'une course : chauffeur B a déjà une course 14h-15h, le remplacement est à 9h | B doit apparaître **disponible** pour 9h (aujourd'hui : considéré occupé toute la journée — M5) |
| K2 | 🔴 | Après remplacement, vérifier la nouvelle course | Statut initial cohérent (`programme`, pas `en_cours`) ; l'originale marquée remplacée ; le chauffeur B la voit sur son mobile |
| K3 | 🟠 | Laisser l'écran coordinateur ouvert 10 min, naviguer ailleurs et revenir 5× | Rafraîchissement 30 s fonctionne, pas d'accumulation d'intervalles (fuite mémoire) |
| K4 | 🟠 | Consulter un incident avec et sans médias | Affichage correct, pas de crash sur les champs null |

### L. Dashboard, rapports, carte

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| L1 | 🔴 | KPIs du jour (CA, courses, incidents) après une journée de données connues | Chiffres exacts, comparaisons J-1/S-1/M-1 correctes |
| L2 | 🔴 | KPI ponctualité avec une course longue (2 h) arrivée à l'heure | Ne doit PAS compter comme retard (aujourd'hui : faux — M4) |
| L3 | 🟠 | Rapport client (ReportWizard) matin vs après-midi | Taux de fréquentation calculé avec la capacité de la bonne période ; usagers issus des comptages réels (passagers montés), pas d'un forfait de 40 |
| L4 | 🟠 | Carte GPS : positions temps réel pendant une course active | Position du bon chauffeur, mise à jour ~60 s |
| L5 | 🟡 | Données à cheval sur minuit / fin de mois | Rattachées à la bonne journée/au bon mois |

### M. Logs & undo

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| M1 | 🟠 | Toute action CRUD (admin et mobile) génère un log | `old_data`/`new_data` complets, `source` correcte (admin vs chauffeur_app), email utilisateur |
| M2 | 🟠 | Undo d'une modification de course | Valeurs restaurées à l'identique |
| M3 | 🟠 | Undo d'une **suppression** | Course restaurée avec son id et ses relations (aujourd'hui : nouvel id, FK cassées — M11) ; double-clic sur Undo = une seule restauration |

### N. Sécurité / RLS (tests de pénétration basiques)

À exécuter avec un simple client HTTP muni de la seule clé anon (sans login) :

| # | Prio | Test | Résultat attendu |
|---|---|---|---|
| N1 | 🔴 | `GET /rest/v1/chauffeurs?select=*` | **Refusé ou champs minimaux** (aujourd'hui : tout est lisible, PIN inclus) |
| N2 | 🔴 | `GET /rest/v1/gps_pings?recorded_at=gte.<il y a 1 h>` | Refusé (aujourd'hui : tracking temps réel public) |
| N3 | 🔴 | `PATCH /rest/v1/courses?id=eq.X` (changer un statut) | Refusé pour anon |
| N4 | 🔴 | `GET /rest/v1/incidents` + URL directe d'une photo du bucket `incidents` | Refusé sans authentification |
| N5 | 🟠 | INSERT `gps_pings` sans `course_execution_id` ni `astreinte_session_id` | Refusé (pas de ping orphelin) |
| N6 | 🟠 | Rejouer une session mobile copiée depuis localStorage sur un autre appareil | Session invalide ou détectée |

---

## 4. Priorités recommandées avant mise en production

1. ✅ **FAIT (11/06/2026)** — **Login PIN sécurisé** : migration `20260611120000_secure_pin_login_and_anon_reads.sql` — RPC `chauffeur_login` (SECURITY DEFINER, vérifie le PIN côté serveur, rejette les chauffeurs inactifs, rate limiting 5 échecs/15 min via table `login_attempts`), les PIN ne sont plus lisibles par anon (droits par colonne sur `chauffeurs`), policy SELECT anon de `gps_pings` supprimée (+ policy authenticated ajoutée pour la carte admin). Les pages de login (mobile + web/mobile) et les requêtes coordinateur ont été adaptées. *Restent ouverts : SELECT anon sur `courses`/`incidents` (nécessaires au mode coordinateur sans vraie auth) et hashage des PIN — nécessitent une refonte auth (JWT custom).* 
2. ✅ **FAIT (11/06/2026)** — **AndroidManifest** : `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` ajoutés.
3. ✅ **FAIT (11/06/2026)** — **Médias offline** : les photos/vidéos/audio d'incident sont stockés en data-URL dans la file offline et uploadés au retour du réseau (les deux apps) ; en cas d'échec d'upload l'opération reste en file ; fallback si localStorage plein. Bonus : les vidéos vont maintenant dans `video_url` (avant : `photo_url`). *Reste ouvert : ordre/déduplication de la file.*
4. **Rôles web** : bloquer le signup ouvert ou ajouter un rôle, protéger les pages Paramètres.
5. ✅ **FAIT (11/06/2026)** — **Facturation** : migration `20260611140000_facturation_integrity.sql` — index unique partiel `(chauffeur_id, mois_reference)` sur `factures` (créé seulement si aucun doublon n'existe déjà, sinon WARNING et nettoyage manuel requis) ; RPC `payer_facture` (paiement atomique : verrou sur la facture, refus si déjà payée, imputation FIFO des avances avec verrous de lignes, passage en « payée » — le tout en une transaction). Côté UI : `FacturationPage` appelle la RPC, affiche un message clair en cas de doublon (code 23505) ou de double paiement, bannière rouge + confirmation si `km_fin < km_début` (dépassement km forcé à 0 au lieu d'un calcul silencieusement faux). Corrige M8, M9 (partie facturation) et I5.
6. Corriger le matching de plages dans `ChauffeurDetail.tsx` en réutilisant `findPlageForTime` de FacturationPage.
