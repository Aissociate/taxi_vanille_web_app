# Taxi Vanille

Monorepo regroupant les applications Taxi Vanille et la base de données partagée.

## Structure

```
taxi_vanille_web_app/
├── web/                  # App d'administration / coordination (React 18 + Vite 5)
├── mobile/               # App chauffeur Capacitor pour Android (React 19 + Vite 8)
└── supabase/migrations/  # Schéma Supabase partagé — SOURCE DE VÉRITÉ UNIQUE
```

Les deux applications partagent la **même base de données Supabase**. Toute modification
du schéma se fait **uniquement** dans `supabase/migrations/`, jamais en double.

## Application web (admin / coordination)

```bash
cd web
npm install
npm run dev
```

Back-office : tableau de bord, clients, chauffeurs, facturation, planning,
incidents, carte GPS, réglages (tarifs, lignes, utilisateurs…).

## Application mobile (chauffeur — Android)

```bash
cd mobile
npm install
npm run dev           # aperçu web
npm run cap:sync      # build + synchro Capacitor
npm run cap:open      # ouvrir le projet Android (Android Studio)
npm run cap:build-apk # générer l'APK de debug
```

App terrain : login chauffeur, planning, détail des courses, kilométrage,
signalement d'incidents, file d'attente hors-ligne, GPS.

`appId` : `com.taxivanille.chauffeur`

## Base de données

Les migrations dans `supabase/migrations/` sont ordonnées par horodatage et
combinent l'historique des deux applications. Pour appliquer le schéma :

```bash
supabase db push
```
