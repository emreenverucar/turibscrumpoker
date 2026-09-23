# Scrum Poker (Belirsizlik + Karmaşıklık + Efor)

Node.js ile çalışan, takımın aynı URL üzerinden odaya katıldığı prototip.

## Render'a ücretsiz yayınlama

1. GitHub'da yeni bir repo oluştur: `scrum-poker`, görünürlük tercihini seç (kurum içi kod için Private).
2. Bu klasördeki `server.js`, `index.html`, `package.json`, `README.md` dosyalarını reponun **köküne** yükle. ZIP dosyasını veya dış klasörü tek dosya olarak yükleme.
3. https://dashboard.render.com/ adresinden `New` > `Web Service` seç, GitHub hesabını bağla, repoyu seç.
4. `Language/Runtime: Node`; `Build Command: npm install`; `Start Command: npm start`; `Instance Type: Free` seç.
5. Varsa `Health Check Path`: `/api/health`. `Create Web Service` de. Deploy tamamlanınca Render'ın verdiği `https://...onrender.com` linkini aç.
6. Moderatör aynı HTTPS adresinden oda oluştursun ve katılım bağlantısını takım arkadaşlarına göndersin.

**Önemli:** Render'ın ücretsiz servisi yaklaşık 15 dakika trafik olmazsa uykuya geçer; uyanması zaman alabilir. Oda/oy verileri sadece bellekte tutulduğu için sunucu uykuya geçince, yeniden başlatılınca veya deploy edilince kaybolur. Oylama sonunda CSV'yi indir. Bu uygulama gerçek üyelik, şifre, erişim kontrolü veya kalıcı veritabanı içermez. Hassas/kurumsal story'leri kamusal hizmete yüklemeden önce güvenlik ve kurum iznini değerlendir.

## Yerel kullanım

Node.js 18+ kurulu iken `npm start` veya Windows'ta `baslat_windows.bat`; `http://localhost:8765`.

Sunucu Render'ın sağladığı `PORT` üzerinden `0.0.0.0` adresinde dinler. Harici npm bağımlılığı yoktur.

## V3: Puanın oylama sonrasında gösterilmesi

- Katılımcı üç seviye seçerken puan **Gizli** görünür. Gönderim başarılı olduğunda yalnızca kendi kayıtlı tahmininin puanı gösterilir.
- Gönderilen seçim değiştirilirse yeni puan tekrar gizlenir; güncelleme gönderilince açılır. Oy geri çekilince veya yeni tur başlayınca gizlenir.
- Eşleştirme tablosu katılımcı ekranından kaldırıldı ve API katılımcılara bu tabloyu iletmez. Puanlama yalnızca sunucuda yapılır.
- Diğer takım üyelerinin seçimi ve puanı moderatör **Oyları göster** diyene kadar gizlidir.

**Güncelleme:** Render'a bağlı GitHub deposunun ana dizinindeki `index.html` ve `server.js` dosyalarını bu pakettekilerle değiştirip commit yap. `package.json` / Build Command / Start Command ayarlarını değiştirme. Yeni deploy sırasında bellekteki eski odalar sıfırlanır; önce mevcut oturumları tamamlayıp CSV indir.

## V5 – 2 saniyelik polling kaldırıldı
- Tarayıcının yaklaşık her 1.8 saniyede `/api/state` çağırdığı polling mekanizması kaldırıldı.
- Gerçek zamanlı güncellemeler Server-Sent Events (SSE) ile tek, açık bağlantı üzerinden gelir.
- Kullanıcı oy verdiğinde / odaya katıldığında / moderatör sonuçları açtığında sunucu sadece değişiklik olduğunda state yayınlar.
- Ağ bağlantısını canlı tutmak için 20 saniyelik SSE heartbeat kullanılır; bu yeni bir HTTP isteği oluşturmaz.
- TÜRİB logosu `turib-logo.png` olarak sunucudan servis edilir.
