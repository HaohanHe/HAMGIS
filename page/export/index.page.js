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
            
            // 检测项目类型 - GIS项目使用features，测面积项目使用points
            const isGISProject = parsed.recordType === 'gis_project' || 
                                (parsed.features && Array.isArray(parsed.features));
            
            if (isGISProject) {
              // GIS项目验证
              logger.info(`Parsed GIS data - Name: ${parsed.name}, Features: ${parsed.features ? parsed.features.length : 0}`);
              if (!parsed.features || !Array.isArray(parsed.features)) {
                logger.error("GIS数据缺少 features 数组");
                this.updateLog(getText('exportFailed') || "Invalid Data: No features array");
              } else if (parsed.features.length === 0) {
                logger.error("GIS数据 features 数组为空");
                this.updateLog(getText('exportFailed') || "Invalid Data: Empty features");
              } else {
                const totalPoints = parsed.totalPoints || parsed.features.reduce((sum, f) => {
                  if (f.featureType === 'point') return sum + 1;
                  return sum + (f.coords ? f.coords.length : 0);
                }, 0);
                const msg = (getText('gisDataReady') || "GIS Data Ready: %d features, %d points").replace('%d', parsed.features.length).replace('%d', totalPoints);
                this.updateLog(msg);
              }
            } else {
              // 测面积项目验证
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

      // 二维码 - 减小尺寸，紧凑显示
      const qrcodeUrl = 'https://github.com/HaohanHe/HAMGIS-drop/releases';
      const qrcodeSize = px(90); // 进一步减小二维码尺寸
      const qrcodeX = centerX - qrcodeSize / 2;
      const qrcodeY = px(145); // 调整位置
      
      // 二维码白色背景 - 只包裹二维码本身，很小的内边距
      const padding = px(4);
      createWidget(widget.FILL_RECT, {
        x: qrcodeX - padding,
        y: qrcodeY - padding,
        w: qrcodeSize + padding * 2,
        h: qrcodeSize + padding * 2,
        color: 0xffffff
      });
      
      // 二维码组件 - 不设置bg_color，使用上面的FILL_RECT作为背景
      createWidget(widget.QRCODE, {
        x: qrcodeX,
        y: qrcodeY,
        w: qrcodeSize,
        h: qrcodeSize,
        content: qrcodeUrl
      });
      
      // 按钮 - 居中显示，在二维码下方
      const buttonWidth = px(120); // 减小按钮宽度
      const buttonHeight = px(44); // 减小按钮高度
      createWidget(widget.BUTTON, {
        x: centerX - buttonWidth / 2,
        y: qrcodeY + qrcodeSize + px(40), // 调整间距
        w: buttonWidth, h: buttonHeight,
        radius: px(22),
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
