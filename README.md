# UltraFill

Bağımlılıksız, build gerektirmeyen MV3 WebExtension. Sıfırdan yazılmıştır; üçüncü taraf eklenti kodu kullanılmaz. Modlar: kapalı, doğrusal germe, esnek germe. Varsayılan doğrusal germedir (`stretch`); kayıtlı `off` seçimi korunur. Popup ayarları tüm sekmelere uygulanır; Alt+Shift+F mod döndürür.

## Chrome / Edge

1. `chrome://extensions` (Edge: `edge://extensions`) sayfasını açın.
2. **Geliştirici modu** → **Paketlenmemiş yükle** → bu repo klasörünü seçin.
3. Önceden açık video sekmelerini yenileyin. Popup’tan modu seçin.

## Safari (macOS)

1. `safari.zip` dosyasını açın.
2. `UltraFill.xcodeproj`'u Xcode ile açın; gerekirse Signing takımını seçin.
3. Xcode'da **⌘R** ile çalıştırın.
4. **Safari → Ayarlar → Uzantılar** altında UltraFill’i etkinleştirip site erişimi verin.
5. Gerekirse Safari'de **Geliştirme menüsü → İmzasız uzantılara izin ver** seçin. Menü adları Safari sürümüne göre değişebilir.

`safari.zip` içindeki kaynaklar (`Resources/`) kök klasördeki eklenti dosyalarıyla aynıdır. Safari sürümünün MV3 service worker desteği gerekir.

## Eşleme

Kaynak koordinatı `s ∈ [-1,1]`, ekran koordinatı `x`:

`x = s * (k + (1-k) * s²)`

`k = 1 - güç * (1 - min(1, kaynakOranı/hedefOranı))`

Tam güçte merkezde fiziksel ölçek `(hedefOranı/kaynakOranı)*k = 1`; kenarlara doğru germe artar. Türev `k + 3*(1-k)*s² > 0`; uçlar sabit, kırpma yok. Shader ekran→kaynak örneklemesi için bu monoton fonksiyonun tersini 14 adımlı ikili aramayla bulur. Eğriyi doğrudan ekran→kaynak yönünde kullanmak merkezi korumaz. Geçersiz değerler doğrusal eşlemeye düşer. Daha dar hedefte doğrusal doldurma kullanılır.

## Sınırlar

- DRM/EME, CORS engeli, shader/WebGL hatası: doğrusal fallback. Popup etkin sekmenin frame durumunu yaklaşık 2 saniye gecikmeyle gösterir. Worker yeniden başladıysa durum bir sonraki bildirime kadar boş olabilir.
- Doğrusal mod `object-fit: fill` kullanır: `scaleX` gibi görüntüyü doğrusal gerer, ancak yerel kontrolleri ölçeklemez.
- Yerel video kontrolleri veya video öğesinin doğrudan tam ekranı: yalnız `object-fit: fill` (geometri değişmez); opacity ile yerel kontrolleri gizlemez.
- Geometri kuralı: video kutusu hedef alanı (tam ekran öğesi, `html`/`body` ise görüntü alanı, tam ekran dışında bilinen oynatıcı kapsayıcısı) zaten kaplıyorsa yalnız `object-fit: fill` uygulanır. Kaplamıyorsa yalnız videonun dal zinciri hedefe yayılır. Tam ekran dışında kapsayıcı bulunamazsa sayfa geometrisine dokunulmaz. Kapsayıcı seçicileri `content.js` içindeki tek `PLAYERS` sabitindedir; eşleşmese de genel kural çalışır. Gerçek Chrome/Safari ve site testi (YouTube, Netflix, Prime, Apple TV+, Disney+) henüz yapılmadı.
- Her frame kendi en büyük görünür, tercihen oynayan videosunu seçer. Cross-origin frame’ler arasında tek global video seçimi yapılmaz. Açık (open) shadow DOM taranır; kapalı (closed) shadow root’lara erişilemez, içindeki video bulunamaz. Picture-in-picture ve tarayıcı iç sayfaları desteklenmez.
- Videonun içine kodlanmış siyah bantlar kaldırılmaz; kırpmama ilkesi gereği korunur. Piksel erişiminin sessizce siyah görüntü verdiği korumalı akışlar her tarayıcıda saptanamayabilir.
- Duraklama ve gizli sekmede sürekli render durur. Canvas DPR en fazla 2. Esnek mod GPU kullanır ve kenarları bilerek bozar.
- Ağ isteği, telemetri veya dış sunucu yok. `<all_urls>` video bulmak içindir; site iznini tarayıcı ayarlarından daraltabilirsiniz.

## Panel (eklenti penceresi) ve düğmeler (v1.1.1)

- Pencere `storage.local`'a yazar, etkin sekme anında uygular. Etkin sekmenin host'u ve video/DRM durumu mevcut `status` mesajlaşmasıyla `background.js` üzerinden gelir (yeni izin yok); alınamazsa alan "—" gösterir.
- YouTube `.ytp-right-controls` içindeki düğme ve diğer sitelerde videonun üstündeki yüzen düğme yalnız tık ile mod döndürür (kapalı → doldur → esnek). Sağ tık/uzun basma yok. Tek kez eklenir, SPA'da kontrol çubuğu yenilenince geri gelir. Alt+Shift+F aynen çalışır.
- 1.1.1 düzeltmesi: "Kapalı"ya geçince video sola yapışıyordu. Kök neden: doldururken `inset`/`margin` kısaltmaları yazılıyor, bunlar sitenin satır içi `left/top` değerlerini eziyordu; sökümde yalnız kısaltma siliniyor, `left/top` geri gelmiyordu. Artık uzun biçimler (`top/right/bottom/left`, `margin-*`) ayrı ayrı yazılıp geri alınır (`test/stale.test.mjs` A5, sahte CSSOM ile; gerçek Chrome'da doğrulanmadı). Doğrusal germe ve görüntü filtreleri çalışmaya devam eder.
- Kapsam dışı (1.2.0): kare enterpolasyonu (1.3.0'da Akıcılık olarak eklendi, aşağıda).


HDR güçlendirme (Görüntü sekmesi, varsayılan kapalı, güç %50):
- Gerçek HDR çıkışı SAĞLAMAZ. Piksel okumadan, `--uf-filter` zincirine eklenen gizli SVG filtresiyle SDR ton eğrisi uygular (parlak tonlar açılır, gölgeler korunur, hafif doygunluk). Ekran `(dynamic-range: high)` ise panel "HDR ekran algılandı", değilse "SDR ekran: ton genişletme" der; ikisinde de çıktı aynı SDR filtredir.
- Piksel okunmadığı için DRM/CORS'ta da uygulanır. Sınır: donanım korumalı oynatmada (ör. bazı DRM yolları) tarayıcı CSS/SVG filtresini yok sayabilir; bu durumda etki görünmez.
- Nötr (kapalı veya güç 0) iken filtre, öznitelik ve SVG kalmaz.


## Akıcılık (v1.3.0, deneysel, varsayılan kapalı)

Akıcılık sekmesi: düşük fps videoyu (24/30) yüksek yenileme hızlı ekranda (60/120/144 Hz) ara kareler üreterek akıcı gösterir. Panel "kaynak → çıkış FPS" (ör. `24 → 144`), işleme süresi / bütçe ms (bütçe = 1000 / yenileme hızı) ve durumu (Akıcı / Bütçe aşıldı / DRM: kullanılamaz ...) gösterir. Ayar `storage.local`'dadır, siteye özel geçersiz kılınabilir. Profiller bu ayara dokunmaz; Spor ve Oyun içeriği için açmanız önerilir, siz seçersiniz.
- Yöntem: video karesi her yeni karede iki dokulu halkaya yüklenir; her ekran karesinde önceki ile şimdiki kare arasında `t` konumu çizilir. Yüksek kalite (yalnız WebGL2): 1/4 çözünürlükte 8x8 blok eşleme (±6 piksel, SAD) ile hareket alanı çıkarılır; iki kare `t·v` ve `(1−t)·v` kaydırılıp karıştırılır, eşleşmesi güvensiz bloklarda düz karışıma düşer. Düşük kalite (WebGL1 veya yedek): iki karenin düz karışımı (hayalet/çift görüntü görülebilir). Doldurma/esnek mod ve zoom/filtre canvas üzerinde korunur.
- Gecikme: bir kaynak kare (24 fps'de ~42 ms, 30 fps'de ~33 ms). Görüntü sesten bu kadar geç kalır; panel yaklaşık değeri gösterir.
- Sınır: DRM (`mediaKeys`), CORS'suz başka kökenli video, WebGL yok veya bağlam kaybı, video öğesinin kendisinin tam ekranı durumunda akıcılık kapanır; video CSS ile doldurmaya döner ve neden panelde yazar. DRM aşılmaz.
- GPU yükü: canvas çözünürlüğü DPR ≤ 2 ve en çok 2560×1440; hareket kestirimi yalnız yeni video karesinde çalışır. Süre ölçümü CPU tarafıdır (GPU yürütmesini tam yansıtmaz); `EXT_disjoint_timer_query_webgl2` varsa GPU süresi de ölçülür. Bütçe aşılırsa kalite otomatik düşüğe iner ve yeniden yükselmez (kalite ayarını değiştirince sıfırlanır). Kaynak fps ekran hızına yakınsa kazanç olmaz, yalnız gecikme eklenir; kapatın. Duraklatma, gizli sekme ve `ended`'da çizim döngüsü durur.

## Kontroller

```sh
node test/core.test.mjs
node test/stale.test.mjs
node test/ui.test.mjs
node test/popup.test.mjs
node test/mapping.test.mjs
node test/validate.mjs
node test/content.test.mjs
node test/scan.test.mjs
node test/fallback.test.mjs
node test/geometry.test.mjs
node test/fluid.test.mjs
node test/hdr.test.mjs
node --check content.js
```

Elle: 16:9 test videosunda 21:9/32:9 konteyner, kenar işaretleri ve merkez dairesi; duraklat/devam, seek, SPA video değişimi, tam ekran, slider, iki sekme senkronizasyonu, kısayol, DRM/CORS fallback ve kapatıldığında özgün stillerin geri dönmesi. Gerçek tarayıcı/GPU doğrulaması bu otomatik testlerin kapsamında değildir.
