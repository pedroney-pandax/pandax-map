package br.com.pandax.map;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Registra o plugin de navegacao manualmente. O Capacitor so auto-registra
 * plugins que vem de npm; os que moram no proprio projeto precisam ser
 * apontados aqui, senao o JS nao acha window.plugins.NavGuide.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NavGuidePlugin.class);
        super.onCreate(savedInstanceState);
    }
}