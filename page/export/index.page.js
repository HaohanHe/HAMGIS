import { localStorage } from '@zos/storage';
import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style } from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page'
import { getText } from '@zos/i18n';
import { back } from '@zos/router';
import { getDeviceInfo } from "@zos/device";

const logger = log.getLogger("hamgis-export");

Page(
  BasePage({
    data: {
      statusText: null,
      exportData: null,
      isSending: false,
      logText: "Ready"
    },
    config: {
      keepScreenOn: true
    },

    onInit(params) {
      logger.debug("Export page init (ZML Mode)");
      
      this.updateLog(getText('ready') || "Ready");
      
      try {
        const storedData = localStorage.getItem('hamgis_export_data');
        if (storedData) {
          this.data.exportData = storedData;
          logger.info(`Data Loaded from Storage, length: ${storedData.length}`);
          
          try {
            const parsed = JSON.parse(storedData);
            logger.info(`Parsed data - Name: ${parsed.name}, Points: ${parsed.points ? parsed.points.length : 0}`);
            if (!parsed.points || !Array.isArray(parsed.points)) {
              logger.error("数据缺少 points 数组");
              this.updateLog(getText('exportFailed') || "Invalid Data: No points array");
            } else if (parsed.points.length === 0) {
              logger.error("数据 points 数组为空");
              this.updateLog(getText('exportFailed') || "Invalid Data: Empty points");
            } else {
              const msg = (getText('dataReady') || "Data Ready: %d points").replace('%d', parsed.points.length);
              this.updateLog(msg);
            }
          } catch (parseError) {
            logger.error(`JSON解析失败: ${parseError}`);
            this.updateLog(getText('exportFailed') || "Invalid Data: JSON parse error");
          }
        } else {
          this.updateLog(getText('noDataToExport') || "Storage Empty");
        }
      } catch (e) {
        logger.error("Storage Read Error", e);
        this.updateLog(getText('exportFailed') || "Storage Error");
      }
    },

    build() {
      const { width, height } = getDeviceInfo();
      const centerX = width / 2;
      
      createWidget(widget.FILL_RECT, {
        x: 0, y: 0, w: width, h: height,
        color: 0x000000
      });

      // 标题
      createWidget(widget.TEXT, {
        x: 0, y: px(20), w: width, h: px(40),
        text: getText('export') || "Export to Phone",
        color: 0xffffff,
        text_size: px(24),
        align_h: align.CENTER_H,
        text_style: text_style.BOLD
      });

      // 状态文本 - 减小高度，更紧凑
      this.data.statusText = createWidget(widget.TEXT, {
        x: px(20), y: px(70), w: width - px(40), h: px(50),
        text: this.data.logText,
        color: 0xaaaaaa,
        text_size: px(18),
        align_h: align.CENTER_H,
        text_style: text_style.WRAP
      });

      // 二维码 - 居中显示，尺寸适中
      const qrcodeUrl = 'https://github.com/HaohanHe/HAMGIS-drop/releases';
      const qrcodeSize = px(120);
      const qrcodeX = centerX - qrcodeSize / 2;
      const qrcodeY = px(130); // 标题和文本下方合适位置
      
      createWidget(widget.QRCODE, {
        x: qrcodeX,
        y: qrcodeY,
        w: qrcodeSize,
        h: qrcodeSize,
        content: qrcodeUrl
      });
      
      // 按钮 - 居中显示，在二维码下方合适位置
      const buttonWidth = px(140);
      const buttonHeight = px(50);
      createWidget(widget.BUTTON, {
        x: centerX - buttonWidth / 2,
        y: qrcodeY + qrcodeSize + px(30), // 二维码下方 30px，增加间距
        w: buttonWidth, h: buttonHeight,
        radius: px(25),
        normal_color: 0x0077cc,
        press_color: 0x0055aa,
        text: getText('start') || "Start",
        color: 0xffffff,
        click_func: () => {
          this.startExport();
        }
      });
    },

    updateLog(msg) {
      logger.info(msg);
      this.data.logText = msg;
      if (this.data.statusText) {
        this.data.statusText.setProperty(prop.TEXT, msg);
      }
    },

    startExport() {
      if (this.data.isSending) return;
      
      if (!this.data.exportData) {
          const stored = localStorage.getItem('hamgis_export_data');
          if (stored) {
              this.data.exportData = stored;
              logger.info(`Data loaded from storage, length: ${stored.length}`);
              const msg = (getText('dataReady') || "Data Ready: %d points").replace('%d', JSON.parse(stored).points?.length || 0);
              this.updateLog(msg);
          }
      }
      
      if (!this.data.exportData) {
        this.updateLog(getText('noDataToExport') || "No data to export (Storage Empty)");
        logger.error("No data to export");
        return;
      }
      
      try {
        const parsed = JSON.parse(this.data.exportData);
        if (!parsed.points || !Array.isArray(parsed.points) || parsed.points.length === 0) {
          this.updateLog(getText('exportFailed') || "Invalid Data: No points");
          logger.error("Invalid data: no points array");
          return;
        }
        logger.info(`Ready to export: ${parsed.name}, ${parsed.points.length} points`);
      } catch (e) {
        this.updateLog(getText('exportFailed') || "Invalid Data: JSON error");
        logger.error(`JSON parse error: ${e}`);
        return;
      }

      const sendingMsg = getText('sending') || "Sending to Phone...";
      this.updateLog(sendingMsg);
      this.data.isSending = true;
      logger.info(`Sending data to phone, length: ${this.data.exportData.length}`);

      this.request({
        method: 'exportData',
        params: {
          data: this.data.exportData
        }
      })
      .then((result) => {
        logger.log('ZML Result:', result)
        if (result && result.status === 'success') {
           this.updateLog(getText('exportSuccess') || "Export Success!");
        } else {
           const failedMsg = getText('exportFailed') || "Export Failed";
           this.updateLog(failedMsg + ": " + (result ? result.status : "Unknown"));
        }
        this.data.isSending = false;
      })
      .catch((error) => {
        logger.error('ZML Error:', error)
        this.updateLog(getText('connectionError') || "Connection Error. Check Zepp App.");
        this.data.isSending = false;
      })
    },

    onDestroy() {
      // Cleanup if needed
    }
  })
);
