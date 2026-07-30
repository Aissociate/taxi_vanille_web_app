# Mise à jour à distance (OTA) — app chauffeur

L'app chauffeur/coordinateur est une app **Capacitor** : une coquille Android qui
affiche l'app web (`web/`). Comme 99 % du code est web, on peut envoyer les
correctifs **à distance**, sans repasser par un store et sans réinstaller l'APK.

- **Code source unique** : `web/`. Le mode mobile s'active automatiquement dans
  l'APK (voir `web/src/App.tsx`).
- **Coquille Android** : `mobile/android`, repointée sur `web/dist`
  (`mobile/capacitor.config.ts` → `webDir: '../web/dist'`).
- **OTA** : plugin `@capgo/capacitor-updater` en **mode manuel**, piloté par
  `web/src/lib/ota.ts`. Le bundle est hébergé sur **Supabase Storage** (bucket
  `ota`, gratuit). Aucun compte cloud Capgo.

> Le vieux dossier `mobile/src` (fork React 19) n'est plus utilisé. À supprimer
> quand tu veux, pour éviter toute confusion.

---

## 1. Une seule fois : reconstruire et réinstaller l'APK

L'APK doit contenir le plugin OTA. **Cette étape est unique.** Comme la signature
du nouvel APK diffère de l'ancien (build debug d'une autre machine), les
chauffeurs devront **désinstaller l'ancienne app puis installer la nouvelle**.
Aucune donnée perdue (tout est dans Supabase).

Dans ton environnement Android (celui qui a le SDK). **À lancer depuis ton
propre terminal PowerShell** — pas via l'assistant, dont le bac à sable bloque
les connexions loopback dont Gradle a besoin :

```powershell
# 1. build web + synchro Capacitor (copie web/dist dans l'APK + plugin OTA)
cd "mobile"
npm install
node node_modules/@capacitor/cli/bin/capacitor sync android

# 2. build de l'APK
cd android
.\gradlew.bat assembleDebug
# APK -> mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

> **Java 21 requis.** Capacitor 8 compile en Java 21. Le projet est déjà
> configuré pour : `mobile/android/settings.gradle` télécharge un JDK 21 via
> foojay, et `mobile/android/gradle.properties` (`org.gradle.java.home`) fait
> tourner Gradle dessus. Si le chemin du JDK change un jour, adapte cette ligne.

Puis : distribue cet APK, les chauffeurs désinstallent l'ancienne app et
installent celle-ci. **C'est la dernière réinstallation manuelle.**

> Astuce : pour éviter toute future réinstallation lors d'un vrai changement
> natif, tu peux plus tard signer l'APK avec un **keystore de release fixe**
> (conservé précieusement). Tant que la clé ne change pas, les mises à jour
> natives s'installent par-dessus. Non nécessaire pour l'OTA.

---

## 2. À chaque correctif : publier à distance (30 s)

Une seule commande, depuis la racine du projet :

```bash
# clé service_role Supabase (à garder secrète, jamais commitée)
export SUPABASE_SERVICE_ROLE_KEY="..."        # PowerShell : $env:SUPABASE_SERVICE_ROLE_KEY="..."

npm run publish:ota -- 1.4.0                    # numéro de version croissant
```

Le script :
1. build `web/`,
2. compresse `web/dist`,
3. upload le bundle sur Supabase Storage,
4. met à jour le manifeste `ota/manifest/chauffeur.json`.

Les téléphones lisent le manifeste **au lancement suivant**, téléchargent le
bundle en silence, et l'appliquent **au démarrage d'après** (aucune interruption
en cours d'utilisation).

> Toujours **incrémenter** le numéro de version (1.4.0 → 1.4.1 → 1.5.0). Une
> version inférieure ou égale à celle déjà installée est ignorée.

---

## Ce qui passe en OTA / ce qui ne passe pas

| Changement | OTA ? |
|---|---|
| Bug React, texte, couleur, écran, logique, requête Supabase | ✅ à distance |
| Ajout d'un plugin natif, permission Android, icône, nom de l'app | ❌ nouvel APK (étape 1) |

## Sécurité anti-brique

`notifyAppReady()` est appelé au démarrage (`web/src/lib/ota.ts`). Si un bundle
téléchargé plante avant cet appel, Capgo **revient automatiquement** à la version
précédente. Un correctif défaillant ne bloque donc pas les chauffeurs.
