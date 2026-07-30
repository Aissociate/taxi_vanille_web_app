#!/usr/bin/env node
/**
 * Publication d'une mise a jour a distance (OTA) de l'app chauffeur.
 *
 *   1. build de web/  ->  web/dist
 *   2. compression du contenu de dist en .zip (index.html a la racine)
 *   3. upload du zip sur Supabase Storage (bucket "ota")
 *   4. ecriture du manifeste pointant vers ce zip
 *
 * Les telephones lisent le manifeste au demarrage et telechargent le nouveau
 * bundle. Aucun passage par un store, aucune reinstallation.
 *
 * Prerequis : la cle service_role Supabase, JAMAIS commitee.
 *   export SUPABASE_SERVICE_ROLE_KEY="..."   (bash)
 *   $env:SUPABASE_SERVICE_ROLE_KEY="..."     (PowerShell)
 *
 * Usage :
 *   npm run publish:ota -- 1.4.0        # publie la version 1.4.0
 */
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WEB = join(ROOT, 'web');
const DIST = join(WEB, 'dist');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://decmcmviiknbkcsamuow.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('\n❌ SUPABASE_SERVICE_ROLE_KEY manquant.');
  console.error('   Recupere-la dans Supabase > Project Settings > API > service_role,');
  console.error('   puis exporte-la avant de relancer (voir en-tete du script).\n');
  process.exit(1);
}

// Version cible : argument CLI, sinon "version" de web/package.json.
const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
if (!version || version === '0.0.0') {
  console.error('\n❌ Precise une version. Ex : npm run publish:ota -- 1.4.0\n');
  process.exit(1);
}

console.log(`\n📦 Publication OTA — version ${version}\n`);

// 1. Build web/
console.log('→ Build de web/…');
execSync('npm run build', { cwd: WEB, stdio: 'inherit' });

// 2. Compression (contenu de dist a la racine du zip)
console.log('→ Compression du bundle…');
const zip = new AdmZip();
zip.addLocalFolder(DIST);
const zipBuffer = zip.toBuffer();

// 3. Upload
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const bundlePath = `bundles/chauffeur-${version}.zip`;

console.log('→ Upload du bundle…');
const up = await supabase.storage.from('ota').upload(bundlePath, zipBuffer, {
  contentType: 'application/zip',
  upsert: true,
});
if (up.error) {
  console.error('\n❌ Echec upload du bundle :', up.error.message, '\n');
  process.exit(1);
}

const { data: pub } = supabase.storage.from('ota').getPublicUrl(bundlePath);
const bundleUrl = pub.publicUrl;

// 4. Manifeste
const manifest = { version, url: bundleUrl, publishedAt: new Date().toISOString() };
console.log('→ Mise a jour du manifeste…');
const man = await supabase.storage
  .from('ota')
  .upload('manifest/chauffeur.json', Buffer.from(JSON.stringify(manifest, null, 2)), {
    contentType: 'application/json',
    upsert: true,
  });
if (man.error) {
  console.error('\n❌ Echec upload du manifeste :', man.error.message, '\n');
  process.exit(1);
}

console.log(`\n✅ Version ${version} publiee.`);
console.log(`   Bundle : ${bundleUrl}`);
console.log(`   Les chauffeurs recevront la mise a jour au prochain lancement de l'app.\n`);
