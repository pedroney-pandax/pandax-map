package br.com.pandax.map;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Ponte entre o JavaScript e o Android para navegacao.
 *
 * Por que existe em vez de usar geolocation do navegador: no WebView, o
 * watchPosition e cortado quando o app vai para segundo plano e o
 * speechSynthesis e inconsistente entre aparelhos. Aqui o GPS vem de um
 * foreground service (NavService) e a voz sai do TextToSpeech do sistema.
 *
 * Apos migrar para app nativo, o resto do codigo web continua igual: existe
 * um unico wrapper em js/navegacao.js que escolhe entre este plugin e a API
 * do navegador.
 *
 * API exposta ao JS:
 *   iniciar({ texto })  -> liga GPS em foreground
 *   parar()             -> desliga GPS e a voz
 *   falar({ texto })    -> fala em pt-BR
 *   pararFala()
 *   mudo({ valor })     -> liga/desliga a voz sem perder a rota
 *   manterAcordado()   -> tela acesa (FLAG_KEEP_SCREEN_ON)
 *   liberarAcordado()  -> devolve a tela ao controle normal do sistema
 *   evento "posicao"    -> { lat, lon, vel, dir, acc }
 */
@CapacitorPlugin(
    name = "NavGuide",
    permissions = {
        @Permission(
            alias = "localizacao",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        ),
        @Permission(
            alias = "notificacao",
            strings = {
                Manifest.permission.POST_NOTIFICATIONS
            }
        )
    }
)
public class NavGuidePlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ttsPronto = false;
    private boolean mudo = false;

    /**
     * Fala pendente: o TextToSpeech so aceita audio apos o init. */
    private String falaPendente = null;

    /**
     * A lista de ouvintes do NavService e estatica e sobrevive ao WebView.
     * Guardar a referencia e obrigatorio: sem isso, cada recriacao do plugin
     * (giro de tela, recarga do WebView) deixaria um ouvinte velho preso la,
     * chamando notifyListeners num plugin morto. O sintoma e o GPS virar
     * lento com o tempo e o alerta de desvio atrasar, sem erro nenhum no log.
     */
    private NavService.Listener ouvintePosicao;

    @Override
    public void load() {
        super.load();

        ouvintePosicao = new NavService.Listener() {
            @Override
            public void onLocation(double lat, double lon, float speed, float bearing, float accuracy) {
                JSObject o = new JSObject();
                o.put("lat", lat);
                o.put("lon", lon);
                o.put("vel", speed);    // m/s
                o.put("dir", bearing);  // graus, 0 = norte
                o.put("acc", accuracy); // metros
                notifyListeners("posicao", o);
            }
        };
        NavService.addListener(ouvintePosicao);

        initTts();
    }

    /* ------------------------------------------------------------------ *
     * GPS
     * ------------------------------------------------------------------ */

    @PluginMethod
    public void iniciar(PluginCall call) {
        // Se ainda nao ha permissao, pede e volta por aqui quando o usuario
        // responder. So entao liga o foreground service.
        if (getPermissionState("localizacao") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("localizacao", call, "concedeuLocalizacao");
            return;
        }
        checarNotificacao(call);
    }

    @PermissionCallback
    private void concedeuLocalizacao(PluginCall call) {
        if (getPermissionState("localizacao") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Permissao de localizacao negada. Ative o GPS nas configuracoes do aparelho.");
            return;
        }
        checarNotificacao(call);
    }

    /**
     * A partir do Android 13 o usuario precisa autorizar a notificacao para
     * ela aparecer. Sem isso o foreground service continua funcionando, mas
     * nada aparece na barra: o motorista nao tem como saber que o app esta
     * acompanhando ele nem que pode fechar a tela.
     *
     * Negar a notificacao NAO impede a navegacao, so avisa.
     */
    private void checarNotificacao(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            ligarGps(call);
            return;
        }
        if (getPermissionState("notificacao") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notificacao", call, "concedeuNotificacao");
            return;
        }
        ligarGps(call);
    }

    @PermissionCallback
    private void concedeuNotificacao(PluginCall call) {
        if (getPermissionState("notificacao") != com.getcapacitor.PermissionState.GRANTED) {
            JSObject w = new JSObject();
            w.put("aviso", "Sem permissao de notificacao a navegacao segue, mas nada aparece na barra de status.");
            notifyListeners("semNotificacao", w);
        }
        ligarGps(call);
    }

    private void ligarGps(PluginCall call) {
        try {
            String texto = call.getString("texto", "Navegando");
            NavService.iniciar(getContext(), texto);
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("texto", texto);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Nao foi possivel iniciar o GPS: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void parar(PluginCall call) {
        try {
            NavService.parar(getContext());
            pararFalaAgora();
            call.resolve();
        } catch (Exception e) {
            call.reject("Nao foi possivel parar o GPS: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("rodando", NavService.isRunning());
        r.put("tts", ttsPronto);
        call.resolve(r);
    }

    /* ------------------------------------------------------------------ *
     * Voz
     * ------------------------------------------------------------------ */

    private void initTts() {
        tts = new TextToSpeech(getContext(), status -> {
            if (status != TextToSpeech.SUCCESS) return;

            // Nem todo aparelho tem motor de voz em pt-BR instalado. Sem o
            // fallback a navegacao fica muda, entao avisamos e seguimos.
            int res = tts.setLanguage(new Locale("pt", "BR"));
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                res = tts.setLanguage(new Locale("pt"));
            }

            ttsPronto = true;

            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                JSObject w = new JSObject();
                w.put("aviso", "Sem voz em portugues neste aparelho.");
                notifyListeners("semVoz", w);
            }

            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { }
                @Override public void onError(String id) { }
            });

            // Fala disparada antes do init ficar pendurada.
            if (falaPendente != null) {
                String t = falaPendente;
                falaPendente = null;
                falarAgora(t);
            }
        });
    }

    @PluginMethod
    public void falar(PluginCall call) {
        String texto = call.getString("texto");
        if (texto == null || texto.trim().isEmpty()) {
            call.reject("Texto vazio.");
            return;
        }
        mudo = false; // uma fala explicita religa o audio

        if (!ttsPronto) {
            falaPendente = texto;
            call.resolve();
            return;
        }
        falarAgora(texto);
        call.resolve();
    }

    private void falarAgora(String texto) {
        if (tts == null || !ttsPronto) return;
        // Segunda barreira ao mudo: o JavaScript ja nao chama, mas se algum
        // caminho novo chamar falar() direto, o silencio continua valendo.
        if (mudo) return;
        // flush remove a fila: manobras seguidas nao podem se atropelar
        tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "pandax");
    }

    @PluginMethod
    public void pararFala(PluginCall call) {
        pararFalaAgora();
        call.resolve();
    }

    private void pararFalaAgora() {
        falaPendente = null;
        if (tts != null) {
            try {
                tts.stop();
            } catch (Exception e) {
                // motor de voz morreu junto com o processo: nada a fazer
            }
        }
    }

    @PluginMethod
    public void mudo(PluginCall call) {
        Boolean v = call.getBoolean("valor");
        mudo = (v != null) && v;
        if (mudo) pararFalaAgora();
        call.resolve();
    }

    /**
     * Entrega o destino ao app de mapas do aparelho (geo:). No Android isso
     * abre o que o usuario tiver como padrao: Google Maps, Waze, Organic Maps
     * ou o proprio Maps. No WebView um geo: nao dispara nada, por isso aqui
     * ele vira um Intent de verdade.
     */
    @PluginMethod
    public void abrirMapa(PluginCall call) {
        String lat = call.getString("lat");
        String lon = call.getString("lon");
        String label = call.getString("label", "Destino");
        if (lat == null || lon == null) {
            call.reject("Faltam as coordenadas do destino.");
            return;
        }
        try {
            String alvo = lat + "," + lon;
            Uri uri = Uri.parse("geo:" + alvo + "?q=" + alvo + "(" + Uri.encode(label) + ")");
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            // Aparelho sem nenhum app de mapas: cai na versao web, que
            // funciona no navegador em qualquer sistema.
            call.reject("Nenhum app de mapas instalado neste aparelho.", e);
        } catch (Exception e) {
            call.reject("Nao foi possivel abrir o app de mapas: " + e.getMessage(), e);
        }
    }

    /* ------------------------------------------------------------------ *
     * Tela sempre ligada
     * ------------------------------------------------------------------ */

    /**
     * App de rota: a tela nao pode apagar no meio do caminho. Liga o
     * FLAG_KEEP_SCREEN_ON na janela atual. Vale enquanto o app estiver em
     * primeiro plano; nao precisa de permissao nem de wakelock.
     */
    @PluginMethod
    public void manterAcordado(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> {
                getActivity().getWindow().addFlags(
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                );
            });
            call.resolve();
        } catch (Exception e) {
            call.reject("Nao foi possivel manter a tela ligada: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void liberarAcordado(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> {
                getActivity().getWindow().clearFlags(
                    android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                );
            });
            call.resolve();
        } catch (Exception e) {
            call.resolve(); // nunca quebra por causa disso
        }
    }

    @PluginMethod
    public void vibrar(PluginCall call) {        // Vibra como reforço de quem esta com o som no zero. Silencioso se
        // o aparelho nao tiver motor.
        try {
            Integer ms = call.getInt("ms", 300);
            android.os.Vibrator v =
                (android.os.Vibrator) getContext().getSystemService(
                    android.content.Context.VIBRATOR_SERVICE
                );
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(
                        android.os.VibrationEffect.createOneShot(
                            ms.longValue(),
                            android.os.VibrationEffect.DEFAULT_AMPLITUDE
                        )
                    );
                } else {
                    v.vibrate(ms.longValue());
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve(); // vibracao e um extra, nunca deve quebrar a navegação
        }
    }

    /* ------------------------------------------------------------------ *
     * Atualizacao da base (conteudo do app)
     * ------------------------------------------------------------------ */

    /** Pasta onde mora o conteudo mais recente baixado da base. */
    private static final String DIR_BASE = "pandax-www";

    /** Trava de pacote malicioso: so aceita zip ate 50 MB. */
    private static final long LIMITE_BYTES = 50L * 1024 * 1024;

    /**
     * Baixa o pacote da base (um zip com index.html, js, css) e troca o
     * conteudo do app por ele. O pacote nunca toca no APK nem nos dados do
     * usuario: vira uma pasta nos arquivos internos e o Capacitor passa a
     * servir dali (setServerBasePath), o que mantem a origem local e, com
     * ela, os plugins (GPS/TTS) funcionando na versao nova.
     *
     * Argumentos:
     *   url     -> endereco do zip (ex.: http://192.168.0.10:8080/dist/...)
     *   versao  -> versao que esta sendo instalada, para exibir depois
     */
    @PluginMethod
    public void atualizarBase(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL da base vazia.");
            return;
        }
        String versao = call.getString("versao", "");

        new Thread(() -> {
            File dir;
            try {
                dir = baixarEInstalar(url);
            } catch (Exception e) {
                call.reject("Atualizacao falhou: " + e.getMessage(), e);
                return;
            }

            getActivity().runOnUiThread(() -> {
                try {
                    // Troca a origem servida pelo Capacitor e recarrega.
                    // Precisa ser na thread da UI, como tudo que toca o
                    // WebView. O bridge sobrevive: a origem continua local.
                    getBridge().setServerBasePath(dir.getAbsolutePath());
                    getBridge().getWebView().reload();

                    JSObject r = new JSObject();
                    r.put("ok", true);
                    if (!versao.isEmpty()) r.put("versao", versao);
                    call.resolve(r);
                } catch (Exception e) {
                    // Diretorio aplicado, mas o recarregamento falhou: o
                    // usuario ve o conteudo novo na proxima abertura.
                    call.reject("Aplicada, mas ao recarregar: " + e.getMessage(), e);
                }
            });
        }, "pandax-atualizacao").start();
    }

    /** Baixa o zip, valida e instala a pasta; devolve o diretorio da base. */
    private File baixarEInstalar(String url) throws IOException {
        File zip = new File(getContext().getCacheDir(), "pandax-base.zip");

        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(true);
        int status = conn.getResponseCode();
        if (status != 200) {
            throw new IOException("HTTP " + status + " ao baixar a base.");
        }
        try (InputStream is = conn.getInputStream()) {
            copiarStream(is, zip);
        } finally {
            conn.disconnect();
        }

        // Extrai num diretorio temporario; so vira a base se nada falhar.
        File dir = new File(getContext().getFilesDir(), DIR_BASE);
        File tmp = new File(getContext().getFilesDir(), DIR_BASE + ".tmp");
        File velha = new File(getContext().getFilesDir(), DIR_BASE + ".old");
        excluir(velha);
        excluir(tmp);
        if (!tmp.mkdirs() && !tmp.isDirectory()) {
            throw new IOException("Nao foi possivel criar a area temporaria.");
        }
        descompactar(zip, tmp);

        if (!new File(tmp, "index.html").isFile()) {
            throw new IOException("O pacote recebido nao contem index.html.");
        }

        if (dir.isDirectory() && !dir.renameTo(velha)) {
            excluir(dir);
        }
        if (!tmp.renameTo(dir)) {
            throw new IOException("Nao foi possivel aplicar a base nova.");
        }

        excluir(zip);
        excluir(velha);
        return dir;
    }

    private static void copiarStream(InputStream in, File out) throws IOException {
        try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) != -1) os.write(buf, 0, n);
        }
    }

    private static void descompactar(File zip, File destino) throws IOException {
        String raiz = destino.getCanonicalPath();
        long total = 0;
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                if (e.isDirectory()) {
                    new File(destino, e.getName()).mkdirs();
                    continue;
                }
                total += Math.max(0, e.getSize());
                if (total > LIMITE_BYTES) {
                    throw new IOException("Pacote da base grande demais.");
                }
                File saida = new File(destino, e.getName());
                if (!saida.getCanonicalPath().startsWith(raiz + File.separator)) {
                    throw new IOException("Caminho invalido dentro do pacote: " + e.getName());
                }
                File pai = saida.getParentFile();
                if (pai != null) pai.mkdirs();
                copiarStream(zis, saida);
            }
        }
    }

    private static void excluir(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] filhos = f.listFiles();
            if (filhos != null) {
                for (File filho : filhos) excluir(filho);
            }
        }
        // Se falhar (arquivo aberto), o proximo ciclo tenta de novo.
        f.delete();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        // Remove o ouvinte antes de qualquer outra coisa: depois deste ponto
        // o WebView pode voltar a mandar posicao a qualquer momento.
        if (ouvintePosicao != null) {
            NavService.removeListener(ouvintePosicao);
            ouvintePosicao = null;
        }
        try {
            if (tts != null) {
                tts.stop();
                tts.shutdown();
                tts = null;
            }
        } catch (Exception e) {
            // Encerrando o app: erro aqui e irrelevante
        }
    }
}