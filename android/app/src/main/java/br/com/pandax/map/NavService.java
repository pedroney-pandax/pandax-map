package br.com.pandax.map;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Servico de foreground que mantem o GPS ligado durante a navegacao.
 *
 * Escolha de projeto: LocationManager do framework em vez de
 * play-services-location. Motivo practical e o app nao passa a depender do
 * Google Play Services para funcionar, e assim tambem roda em aparelho
 * sem GMS. O custo e qualidade um pouco menor em " canyons" urbanos;
 * se isso virar problema, o ponto de troca e o metodo {@link #startProviders}.
 */
public class NavService extends Service {

    private static final String TAG = "PandaxNav";
    private static final String CHANNEL_ID = "pandax_navegacao";
    private static final int NOTIF_ID = 4207;

    /** Intervalo minimo entreAtualizacoes: 1 s / 0 m. */
    private static final long INTERVALO_MS = 1000L;
    private static final float INTERVALO_M = 0f;

    private static final String EXTRA_TEXTO = "texto";

    /**
     * O servico e o plugin vivem no mesmo processo, entao a lista de
     * ouvintes e estatica. O WebView pode ser recriado durante a navegacao
     * (rotacao, segundo plano); o plugin se registra de novo no load().
     */
    public interface Listener {
        void onLocation(double lat, double lon, float speed, float bearing, float accuracy);
    }

    private static final List<Listener> LISTENERS = new CopyOnWriteArrayList<>();

    public static void addListener(Listener l) {
        if (l != null && !LISTENERS.contains(l)) LISTENERS.add(l);
    }

    public static void removeListener(Listener l) {
        LISTENERS.remove(l);
    }

    public static boolean isRunning() {
        return RUNNING;
    }

    private static volatile boolean RUNNING = false;

    private LocationManager lm;
    private PowerManager.WakeLock wakeLock;
    private LocationListener provedorListener;
    private String statusText = "Navegando";

    /* ------------------------------------------------------------------ *
     * Ciclo de vida do servico
     * ------------------------------------------------------------------ */

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanal();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String texto = intent == null ? null : intent.getStringExtra(EXTRA_TEXTO);
        if (texto != null) statusText = texto;

        // Falta de permissao aqui estoura SecurityException no startForeground.
        // E o caso comum: usuario negou o GPS depois de instalar.
        if (!temPermissaoLocalizacao()) {
            Log.w(TAG, "Servico iniciado sem permissao de localizacao; abortando.");
            pararTudo();
            return START_NOT_STICKY;
        }

        try {
            ServiceCompat.startForeground(
                this,
                NOTIF_ID,
                buildNotification(statusText),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } catch (Exception e) {
            // API 34+ barra foreground service de location sem a permissao.
            Log.e(TAG, "Falha ao entrar em foreground", e);
            pararTudo();
            return START_NOT_STICKY;
        }

        segurarCpu();
        startProviders();

        RUNNING = true;
        // STICKY: se o sistema matar o processo sob pressao de memoria,
        // a navegacao volta sozinha em vez de morrer em silencio.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        pararTudo();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // nao é um servico que o WebView "liga", so dispara e observa
    }

    private void pararTudo() {
        RUNNING = false;
        stopProviders();
        soltarCpu();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    /** Inicia o servico ja em foreground, para o app poder virar notificação. */
    public static void iniciar(Context ctx, String texto) {
        Intent i = new Intent(ctx, NavService.class);
        if (texto != null) i.putExtra(EXTRA_TEXTO, texto);
        // startForegroundService exige o startForeground em 5 s; o servico
        // faz isso logo no onStartCommand, mas o texto ainda pode ser null
        // se o intent for reentregue pelo sistema.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void parar(Context ctx) {
        ctx.stopService(new Intent(ctx, NavService.class));
    }

    /* ------------------------------------------------------------------ *
     * GPS
     * ------------------------------------------------------------------ */

    private void startProviders() {
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return;

        provedorListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location loc) {
                dispatch(loc);
            }

            // Metodos vazios sao obrigatorios a partir do API 30; sem eles
            // o processo morre com IllegalArgumentException no lint.
            @Override public void onProviderDisabled(String provider) { }
            @Override public void onProviderEnabled(String provider) { }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
        };

        registrar(LocationManager.GPS_PROVIDER, INTERVALO_MS);
        // A rede entra so como preciosao inicial: se o GPS ainda nao fixou,
        // da para comecar a andar pela rota sem ficar parado no semaforo.
        registrar(LocationManager.NETWORK_PROVIDER, 2000L);
    }

    private void registrar(String provedor, long intervalo) {
        try {
            if (lm.isProviderEnabled(provedor)) {
                lm.requestLocationUpdates(
                    provedor, intervalo, INTERVALO_M, provedorListener, Looper.getMainLooper()
                );
            }
        } catch (SecurityException e) {
            Log.w(TAG, "Sem permissao para o provedor " + provedor, e);
        } catch (Exception e) {
            Log.w(TAG, "Falha ao ligar o provedor " + provedor, e);
        }
    }

    private void stopProviders() {
        if (lm == null || provedorListener == null) return;
        try {
            lm.removeUpdates(provedorListener);
        } catch (Exception e) {
            Log.w(TAG, "Falha ao desligar as atualizacoes", e);
        }
        provedorListener = null;
        lm = null;
    }

    private void dispatch(Location loc) {
        // Posicao sem precisao boa nao serve para manobra: 5000 m de erro
        // coloca o marcador no outro quarteirao.
        if (loc.getAccuracy() > 100f) return;

        double lat = loc.getLatitude();
        double lon = loc.getLongitude();
        float vel = loc.hasSpeed() ? loc.getSpeed() : 0f;
        float dir = loc.hasBearing() ? loc.getBearing() : 0f;
        float acc = loc.getAccuracy();

        for (Listener l : LISTENERS) {
            try {
                l.onLocation(lat, lon, vel, dir, acc);
            } catch (Exception e) {
                Log.e(TAG, "Ouvinte de GPS falhou", e);
            }
        }
    }

    private boolean temPermissaoLocalizacao() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    /* ------------------------------------------------------------------ *
     * CPU acordada
     * ------------------------------------------------------------------ */

    private void segurarCpu() {
        if (wakeLock != null) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            // Sem isso o Android dorme a CPU e o GPS para de entregar
            // posicao com a tela apagada.
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pandax:nav");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(6 * 60 * 60 * 1000L); // 6 h: seguranca contra vazamento
        } catch (Exception e) {
            Log.w(TAG, "Nao foi possivel adquirir o wake lock", e);
            wakeLock = null;
        }
    }

    private void soltarCpu() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception e) {
                Log.w(TAG, "Falha ao soltar o wake lock", e);
            }
        }
        wakeLock = null;
    }

    /* ------------------------------------------------------------------ *
     * Notificacao
     * ------------------------------------------------------------------ */

    private void criarCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Navegacao", NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("Mostra a navegacao em andamento");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification(String texto) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Pandax MAP")
            .setContentText(texto == null ? statusText : texto)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .build();
    }
}