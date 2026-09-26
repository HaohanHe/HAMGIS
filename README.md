# HAMGIS

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18641957.svg)](https://doi.org/10.5281/zenodo.18641957)

[中文](#中文) ｜ [日本語](#日本語) ｜ [English](#english)

下载 APK：<https://hsyscn.top/HAMGIS.apk>

---

## 中文

HAMGIS 是一款跑在 Zepp OS 智能手表上的野外 GIS 测亩应用。它融合北斗、GPS 等多星定位，在手表端完成轨迹采集、面积周长计算和项目管理，再通过手机端把数据导成专业 GIS 格式。目标用户是农民、测绘员、土地管理员和 GIS 从业者，让他们下到地里不用掏手机，抬手腕就能记边界、算亩数。

### 核心功能

- **多星实时定位**：融合北斗与 GPS，手表端实时追踪测量轨迹（`page/measurement/`、`utils/projection.js`）。
- **面积与周长自动计算**：手动多点勾勒，或按时间间隔自动采集点位，实时算面积和周长（ geodesic 多边形面积公式，见 `page/measurement/`）。
- **气压测高**：通过手表气压计采集海拔，给平面测量加上第三维（`utils/barometer.js`）。
- **手表小地图**：内置 canvas 小地图，实时画出测量路径和已经围合的区域（`utils/minimap-renderer.js`、`page/map/`）。
- **项目与历史管理**：按项目保存测量记录，支持回看、编辑和导出（`page/projects/`、`page/project-detail/`、`page/history/`）。
- **数据导出**：手表端导出 CSV、JSON、GeoJSON，可直接进 ArcGIS、QGIS（`page/export/`、`setting/export.js`）。Android 配套客户端 [HAMGIS Receiver](https://github.com/HaohanHe/HAMGIS-drop) 负责接收手表数据并做格式转换。
- **卫星视图**：手表端查看当前可见卫星和定位状态（`page/satellite/`）。

### 应用场景

国土确权、林业清查、农田测亩、水利管线巡检、电力线路走向、石油地质踏勘、土木工程放样等户外测绘场景。

### 注意事项

- 数据导出在 Android 手表上可用；Zepp OS 的 iOS 配套 API 还没开放，iOS 端导出要等华米官方更新。
- 小内存表款跑长路线定时采集时曾出现 OOM 重启，最近一版已经修过一次，老固件请升级到最新。
- 使用问题或建议请发邮件到 [bugreport@hsyscn.top](mailto:bugreport@hsyscn.top)。

### 目录结构

```
HAMGIS/
├── app.js / app.json          # Zepp OS 应用入口与配置
├── page/                      # 手表端页面
│   ├── measurement/           # 测量主界面
│   ├── map/                   # 小地图
│   ├── projects/               # 项目列表
│   ├── project-detail/         # 项目详情
│   ├── history/                # 历史记录
│   ├── data-view/              # 数据查看
│   ├── export/                 # 导出
│   ├── satellite/              # 卫星视图
│   ├── settings/               # 设置
│   └── i18n/                   # 多语言
├── utils/                     # barometer / elevation / projection / minimap-renderer / formatters
├── setting/                   # 手机端设置与导出桥接（zepp-bridge.js）
├── app-side/                  # 手机端配套逻辑
├── assets/                    # 图标与资源
├── HAMGIS.apk                 # 预编译 APK（也可从 https://hsyscn.top/HAMGIS.apk 下载）
└── poster_generator.html      # 分享海报生成器
```

### 安装与开发

1. 安装 [Zepp CLI](https://docs.zepp.com/docs/guides/tools/cli/)。
2. 克隆本仓库。
3. `npm install` 安装依赖（运行时依赖 `@zeppos/zml`，开发依赖 `@zeppos/device-types`）。
4. `npm run build` 编译，或 `npm run preview` 起预览。

当前版本号见 `package.json`（v1.0.4）。

### 引用

如果你在研究或工作中用到本软件，可通过 Zenodo 引用：<https://doi.org/10.5281/zenodo.18641957>，题录元数据见 [`CITATION.cff`](CITATION.cff)。

### 许可证

MIT，见 [LICENSE](LICENSE)。

---

## 日本語

HAMGIS は Zepp OS スマートウォッチ向けの野外 GIS 測量アプリです。北斗や GPS などのマルチ衛星測位を使い、ウォッチ側で軌跡の収録、面積と周囲長の計算、プロジェクト管理までを完結させ、スマホアプリ経由でプロ仕様の GIS フォーマットにエクスポートします。農家、測量士、土地管理者、GIS 技術者が、現場でスマホを取り出さずに手首を上げるだけで境界を記録し、面積を計算できるようにするのが目的です。

### 主要な機能

- **マルチ衛星リアルタイム測位**：北斗と GPS を統合し、ウォッチ上で計測軌跡をリアルタイム追跡（`page/measurement/`、`utils/projection.js`）。
- **面積・周囲長の自動計算**：手動での多点指定、または時間間隔による自動サンプリングに対応し、面積と周囲長をリアルタイム計算（測地線ポリゴン面積アルゴリズム、`page/measurement/` を参照）。
- **気圧による標高取得**：ウォッチの気圧計で高度を記録し、平面測量に 3 次元目を追加（`utils/barometer.js`）。
- **ウォッチ内ミニマップ**：canvas 製のミニマップを内蔵し、計測経路と囲んだ領域をその場で描画（`utils/minimap-renderer.js`、`page/map/`）。
- **プロジェクトと履歴管理**：計測記録をプロジェクト単位で保存し、見返し、編集、エクスポートが可能（`page/projects/`、`page/project-detail/`、`page/history/`）。
- **データエクスポート**：CSV、JSON、GeoJSON で書き出し、ArcGIS や QGIS に直接読み込めます（`page/export/`、`setting/export.js`）。Android 用のコンパニオンアプリ [HAMGIS Receiver](https://github.com/HaohanHe/HAMGIS-drop) がウォッチからデータを受け取り、フォーマット変換を担当します。
- **衛星ビュー**：ウォッチ上で現在捕捉中の衛星と測位品質を確認（`page/satellite/`）。

### 活用シーン

土地権利確定、林業調査、農地の面積計測、水利管の巡検、電力線のルート確認、石油・地質調査、土木の丁張り確認など、屋外での測量作業全般を想定しています。

### 注意事項

- データエクスポートは Android ウォッチで利用可能です。Zepp OS の iOS 向けコンパニオン API はまだ公開されていないため、iOS 側のエクスポートは Huami 公式 API の更新を待つ必要があります。
- メモリの少ないウォッチで長距離ルートを定時採取すると OOM で再起動する問題が過去にあり、直近バージョンで修正済みです。古いファームウェアの方はアップデートしてください。
- 不具合やご要望は [bugreport@hsyscn.top](mailto:bugreport@hsyscn.top) までメールでお知らせください。

### ディレクトリ構成

```
HAMGIS/
├── app.js / app.json          # Zepp OS アプリのエントリと設定
├── page/                      # ウォッチ画面
│   ├── measurement/           # 計測メイン画面
│   ├── map/                   # ミニマップ
│   ├── projects/              # プロジェクト一覧
│   ├── project-detail/        # プロジェクト詳細
│   ├── history/               # 履歴
│   ├── data-view/             # データ表示
│   ├── export/                # エクスポート
│   ├── satellite/             # 衛星ビュー
│   ├── settings/              # 設定
│   └── i18n/                  # 多言語対応
├── utils/                     # barometer / elevation / projection / minimap-renderer / formatters
├── setting/                   # スマホ側の設定とエクスポート橋渡し（zepp-bridge.js）
├── app-side/                  # スマホ側のロジック
├── assets/                    # アイコン・リソース
├── HAMGIS.apk                 # ビルド済み APK（https://hsyscn.top/HAMGIS.apk からも取得可）
└── poster_generator.html      # 共有ポスター生成ツール
```

### インストールと開発

1. [Zepp CLI](https://docs.zepp.com/docs/guides/tools/cli/) をインストールします。
2. 本リポジトリをクローンします。
3. `npm install` で依存を導入します（実行時依存は `@zeppos/zml`、開発依存は `@zeppos/device-types`）。
4. `npm run build` でビルド、または `npm run preview` でプレビューを起動します。

現在のバージョンは `package.json` を参照してください（v1.0.4）。

### 引用

研究や業務で本ソフトを使用した場合は、Zenodo から引用できます：<https://doi.org/10.5281/zenodo.18641957>。書誌メタデータは [`CITATION.cff`](CITATION.cff) にあります。

### ライセンス

MIT ライセンスです。詳細は [LICENSE](LICENSE) を参照してください。

---

## English

HAMGIS is a field GIS area-measurement app that runs on Zepp OS smartwatches. It fuses Beidou and GPS for real-time positioning, and does track logging, area and perimeter calculation, and project management on the watch itself. Data then flows to a phone companion app that exports professional GIS formats. The target users are farmers, surveyors, land managers, and GIS practitioners who would rather raise their wrist than pull out a phone when standing in a field.

### Features

- **Multi-satellite real-time positioning**: combines Beidou and GPS to track the measurement path on the watch (`page/measurement/`, `utils/projection.js`).
- **Automatic area and perimeter**: manual multi-point boundary or timed auto-sampling, with live area and perimeter calculation (geodesic polygon area formula, see `page/measurement/`).
- **Barometric elevation**: reads the watch barometer for altitude, adding a third dimension to the planar survey (`utils/barometer.js`).
- **On-watch mini-map**: a canvas mini-map draws the path and the enclosed polygon as you walk (`utils/minimap-renderer.js`, `page/map/`).
- **Project and history management**: saves measurement records per project, with review, edit, and export (`page/projects/`, `page/project-detail/`, `page/history/`).
- **Data export**: writes CSV, JSON, and GeoJSON that drop straight into ArcGIS or QGIS (`page/export/`, `setting/export.js`). The Android companion app [HAMGIS Receiver](https://github.com/HaohanHe/HAMGIS-drop) receives data from the watch and converts formats.
- **Satellite view**: shows visible satellites and fix status on the watch (`page/satellite/`).

### Where it is used

Land titling, forest inventory, farmland area measurement, water pipeline inspection, power line routing, oil and geology field work, and civil engineering stakeout.

### Notes

- Data export works on Android watches. Zepp OS has not opened the iOS companion API yet, so iOS export waits on a Huami official update.
- On low-memory watch models, long-route timed sampling previously caused OOM restarts. That has been fixed in a recent release; update old firmware if you hit it.
- Bugs or suggestions go to [bugreport@hsyscn.top](mailto:bugreport@hsyscn.top).

### Layout

```
HAMGIS/
├── app.js / app.json          # Zepp OS entry and config
├── page/                      # Watch screens
│   ├── measurement/           # Main measurement screen
│   ├── map/                   # Mini-map
│   ├── projects/              # Project list
│   ├── project-detail/        # Project detail
│   ├── history/               # History
│   ├── data-view/             # Data view
│   ├── export/                # Export
│   ├── satellite/             # Satellite view
│   ├── settings/              # Settings
│   └── i18n/                  # Localization
├── utils/                     # barometer / elevation / projection / minimap-renderer / formatters
├── setting/                   # Phone-side settings and export bridge (zepp-bridge.js)
├── app-side/                  # Phone-side logic
├── assets/                    # Icons and resources
├── HAMGIS.apk                 # Prebuilt APK (also at https://hsyscn.top/HAMGIS.apk)
└── poster_generator.html      # Share poster generator
```

### Build and development

1. Install the [Zepp CLI](https://docs.zepp.com/docs/guides/tools/cli/).
2. Clone this repository.
3. Run `npm install` (runtime dep `@zeppos/zml`, dev dep `@zeppos/device-types`).
4. `npm run build` to compile, or `npm run preview` for a live preview.

Current version is in `package.json` (v1.0.4).

### Citation

If you use this software in research or work, cite it via Zenodo: <https://doi.org/10.5281/zenodo.18641957>. Bibliographic metadata is in [`CITATION.cff`](CITATION.cff).

### License

MIT, see [LICENSE](LICENSE).
