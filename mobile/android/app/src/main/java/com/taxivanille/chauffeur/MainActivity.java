package com.taxivanille.chauffeur;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ecran TOUJOURS allume tant que l'app est au premier plan (pas de veille).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void onResume() {
        super.onResume();
        startKioskBestEffort();
    }

    // Epinglage d'ecran "best-effort" (sans Device Owner) : masque la barre de
    // notifications et bloque Accueil/Apercu tant que l'app est epinglee. Le
    // chauffeur peut encore sortir en maintenant Retour+Apercu, et les appels ne
    // sont pas bloques (cela necessiterait un provisionnement Device Owner).
    // Aucune reinitialisation du telephone requise.
    private void startKioskBestEffort() {
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                startLockTask();
            }
        } catch (Exception ignored) {
            // Certains appareils / ROM refusent l'epinglage : on ignore proprement
            // pour ne jamais faire planter le demarrage de l'app.
        }
    }
}
