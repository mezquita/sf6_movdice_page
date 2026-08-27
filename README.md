# movdice 設定ツール

movdice用の、ブラウザ完結型の設定ツール。現在は接続実験用の最小ページのみ公開している。

## このページは何をするものか

ESP32-C6搭載の小型LCD表示機「movdice」に対して、USB経由（[Web Serial API](https://developer.mozilla.org/docs/Web/API/Web_Serial_API)）でブラウザから直接、以下を行えるようにするためのツール（開発中）。

- 画像のアップロード（PNG→ESP32用フォーマットへの変換はすべてブラウザ側で完結させる）
- アップロード済み画像の一覧・削除
- 表示プリセットの設定・保存
- 動作確認用のテスト表示
- 再起動

対応ブラウザはWeb Serial APIをサポートするChromium系（Chrome / Edge）のみ。

## movdiceの概観

- ハードウェア: Waveshare ESP32-C6-LCD-1.47（ST7789V3液晶、非タッチ/タッチの2モデルあり）
- ファームウェア: MicroPython
- 通常動作: あらかじめ設定された画像セットをスライドショー表示する専用機
- 設定変更: 起動直後にBOOTボタンを押すと設定モードに入り、このページから直接USB経由で設定できる

## なぜこの構成になっているか

- 画像変換にはリサイズ・圧縮処理が必要だが、ESP32側（MicroPython）にPillow相当のライブラリは載せられない。そのため変換処理はすべてこのページ（ブラウザのJavaScript）側で行う。
- ESP32-C6のUSBは固定機能のCDCシリアルのみで、汎用USB OTGペリフェラルを持たない。そのためUSBドライブとして見せる方式（USB Mass Storage化）は採用できず、Web Serial APIによるシリアル通信を選んでいる。
- 配布先のユーザーにThonny等の専用アプリのインストールを求めないことを目標にしている。

## 技術スタック

| 項目 | 内容 |
|---|---|
| 通信 | Web Serial API |
| 画像変換 | ブラウザ内TypeScript（PNG→RGB565変換→RLE圧縮） |
| ESP32側ファームウェア | MicroPython |

## ビルド

`src/*.ts` をTypeScriptで書き、`tsc`でトランスパイルするだけ（バンドラは使わない）。
生成された `dist/*.js` はコミットに含めてそのままGitHub Pagesで配信する。

```
npm install
npm run build   # tsc実行、dist/以下を更新
```

HTML側は `<script type="module">` で `./dist/serial.js` を読み込む。

## リポジトリの位置づけ

このリポジトリはこのページのソースそのもの（GitHub Pagesで公開）。ESP32側のファームウェアや画像変換スクリプトなど、movdiceの開発一式は別のリポジトリで管理している。
