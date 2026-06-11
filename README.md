# Kripto Supertrend Tarayici

Binance Spot piyasasindaki en yuksek hacimli USDT paritelerini `5m`, `15m`,
`1h`, `4h`, `1d` ve `1w` Supertrend ile tarar. Yalnizca son kapanmis mumda
olusan `YENI AL` ve `YENI SAT` sinyallerini ayri gruplarda raporlar.

```powershell
node .\scanner.mjs
```

Varsayilan ayarlar: ilk 200 parite, ATR 10, carpan 3.

```powershell
$env:SCAN_LIMIT=50
$env:INTERVALS="5m,15m,1h,4h,1d,1w"
$env:ATR_PERIOD=10
$env:ATR_MULTIPLIER=3
node .\scanner.mjs
```

Sonuclar `outputs` klasorune HTML, CSV ve JSON olarak yazilir.
