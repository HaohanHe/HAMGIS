import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style } from '@zos/ui';
import { Geolocation } from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import { getText } from '@zos/i18n';
import { back } from '@zos/router';

const logger = log.getLogger("hamgis-satellite");

Page({
  data: {
    geolocation: null,
    satelliteData: [],
    isDualBand: false,
    widgets: {},
    
    // Stats
    visibleCount: 0,
    usedCount: 0,
    systemCounts: {}, // { 'GPS': 5, 'BDS': 3, ... }
    gpsMode: null,
    signalQuality: null,
    avgSnr: 0
  },

  onInit(params) {
    logger.debug("Satellite page init");
    this.initGPS();
  },

  getGPSMode() {
    try {
      if (this.data.geolocation && typeof this.data.geolocation.getSetting === 'function') {
        const settings = this.data.geolocation.getSetting();
        // mode: 0:Precision, 1:Intelligent, 2:Balanced, 3:PowerSaving, 4:SuperPowerSaving, 5:Custom
        let modeStr = 'mode_unknown';
        switch(settings.mode) {
            case 0: modeStr = 'mode_precision'; break;
            case 1: modeStr = 'mode_balanced'; break; // Actually Intelligent
            case 2: modeStr = 'mode_balanced'; break;
            case 3: modeStr = 'mode_power_saving'; break;
            case 4: modeStr = 'mode_super_power_saving'; break;
            case 5: modeStr = 'mode_custom'; break;
        }
        return getText(modeStr) || modeStr;
      }
    } catch (e) {
      logger.error("Get setting failed", e);
    }
    return getText('mode_unknown');
  },

  initGPS() {
    try {
      this.data.geolocation = new Geolocation();
      
      // Use onGnssChange for detailed stats (API 3.0+)
      if (typeof this.data.geolocation.onGnssChange === 'function') {
        this.data.geolocation.onGnssChange((event) => {
           this.processGnssData(event);
        });
      } else {
        // Fallback to onChange
        this.data.geolocation.onChange((event) => {
          if (event && event.satellite_data) {
             this.processSatelliteData(event.satellite_data);
          }
        });
      }
      
      this.data.geolocation.start();
    } catch (e) {
      logger.error(`GPS Init failed: ${e}`);
    }
  },

  processGnssData(info) {
    // info contains: nb_valid_satellite, nb_used_satellite, satellite_data
    this.data.visibleCount = info.nb_valid_satellite || 0;
    this.data.usedCount = info.nb_used_satellite || 0;
    
    // Signal Quality (Top 4 Avg SNR)
    if (info.top4_cn_val) {
        this.data.avgSnr = info.top4_cn_val;
        let quality = 'weak';
        if (this.data.avgSnr >= 40) quality = 'excellent';
        else if (this.data.avgSnr >= 30) quality = 'good';
        this.data.signalQuality = quality;
    }

    if (info.satellite_data) {
      this.processSatelliteData(info.satellite_data);
    }
  },

  processSatelliteData(data) {
    let allSats = [];
    let isDualBand = false;
    let sysCounts = {
      'GPS': 0,
      'BDS': 0,
      'GLONASS': 0,
      'GALILEO': 0,
      'QZSS': 0,
      'IRNSS': 0,
      'Others': 0
    };

    const getSysName = (id) => {
      switch(id) {
        case 0: return 'GPS';
        case 1: return 'BDS'; // Beidou
        case 2: return 'GLONASS';
        case 3: return 'GALILEO';
        case 4: return 'QZSS';
        case 5: return 'IRNSS';
        default: return 'Others';
      }
    };

    if (Array.isArray(data)) {
      data.forEach(system => {
        if (system.is_dualband === 1) {
          isDualBand = true;
        }
        
        // Count satellites per system
        const sysName = getSysName(system.gnss_id);
        const count = system.nb_valid_satellite || (system.gsv_data ? system.gsv_data.length : 0);
        if (sysName !== 'Others' || count > 0) {
             sysCounts[sysName] = (sysCounts[sysName] || 0) + count;
        }

        if (system.gsv_data && Array.isArray(system.gsv_data)) {
          system.gsv_data.forEach(sat => {
            allSats.push({
              id: sat.id,
              azimuth: sat.azimuth,
              elevation: sat.elevation,
              snr: sat.snr,
              systemId: system.gnss_id
            });
          });
        }
      });
    }

    this.data.satelliteData = allSats;
    this.data.isDualBand = isDualBand;
    this.data.systemCounts = sysCounts;
    
    // Fallback counts if onGnssChange wasn't used
    if (this.data.visibleCount === 0 && allSats.length > 0) {
        this.data.visibleCount = allSats.length;
    }
    
    this.updateUI();
  },

  build() {
    const { width, height } = getDeviceInfo();
    
    // Background
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x000000
    });

    // --- Header Section ---
    let currentY = px(30);
    const lineHeight = px(24);

    // Title
    createWidget(widget.TEXT, {
      x: 0,
      y: px(10),
      w: width,
      h: px(30),
      text: getText('satelliteStatus') || 'Satellite Status',
      color: 0xffffff,
      text_size: px(20),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD
    });
    
    currentY += px(20);

    // Dual Band Status
    this.data.widgets.dualBandText = createWidget(widget.TEXT, {
        x: 0,
        y: currentY,
        w: width,
        h: lineHeight,
        text: '',
        color: 0x00ff88,
        text_size: px(16), 
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
    });
    
    currentY += lineHeight;

    // Positioning Mode
    this.data.widgets.modeText = createWidget(widget.TEXT, {
        x: 0,
        y: currentY,
        w: width,
        h: lineHeight,
        text: `${getText('positioningMode')}: ${this.getGPSMode()}`,
        color: 0xcccccc,
        text_size: px(16),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
    });

    currentY += lineHeight;

    // Signal Quality
    this.data.widgets.signalText = createWidget(widget.TEXT, {
        x: 0,
        y: currentY,
        w: width,
        h: lineHeight,
        text: `${getText('signalQuality')}: --`,
        color: 0x888888,
        text_size: px(16),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
    });

    currentY += lineHeight;

    // Counts (Visible / Used)
    this.data.widgets.countText = createWidget(widget.TEXT, {
        x: 0,
        y: currentY,
        w: width,
        h: lineHeight,
        text: `${getText('visible')}: 0 | ${getText('used')}: 0`,
        color: 0xffffff,
        text_size: px(16),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V
    });
    
    currentY += lineHeight + px(10); // Add some spacing before list

    // --- List Section ---
    const listHeight = height - currentY - px(20); // Leave some space at bottom

    this.data.widgets.sysList = createWidget(widget.SCROLL_LIST, {
        x: 0,
        y: currentY,
        w: width,
        h: listHeight,
        item_space: px(5),
        item_config: [
            {
                type_id: 1,
                item_height: px(40),
                item_bg_color: 0x111111,
                item_bg_radius: px(10),
                text_view: [
                    {
                        x: 0,
                        y: 0,
                        w: width,
                        h: px(40),
                        key: 'text',
                        color: 0xffffff,
                        text_size: px(18),
                        align_h: align.CENTER_H,
                        align_v: align.CENTER_V
                    }
                ],
                text_view_count: 1
            }
        ],
        item_config_count: 1,
        data_array: [], 
        data_count: 0,
        data_type_config: [{ start: 0, end: 0, type_id: 1 }],
        data_type_config_count: 1
    });

    // Update Initial UI
    this.updateUI();
  },

  updateUI() {
    // Update Dual Band
    if (this.data.widgets.dualBandText) {
        const dualText = getText('dualBand') || 'Dual Band (L1+L5)';
        const singleText = getText('singleBand') || 'Single Band';
        this.data.widgets.dualBandText.setProperty(prop.TEXT, this.data.isDualBand ? dualText : singleText);
        // Single Band -> Yellow or Grey? Dual Band -> Green
        this.data.widgets.dualBandText.setProperty(prop.COLOR, this.data.isDualBand ? 0x00ff88 : 0xffcc00);
    }

    // Update Mode
    if (this.data.widgets.modeText) {
        this.data.widgets.modeText.setProperty(prop.TEXT, `${getText('positioningMode')}: ${this.getGPSMode()}`);
    }

    // Update Signal Quality
    if (this.data.widgets.signalText) {
        const quality = this.data.signalQuality || 'weak';
        const qText = getText(quality) || quality;
        const avg = this.data.avgSnr ? `(${this.data.avgSnr.toFixed(1)})` : '';
        this.data.widgets.signalText.setProperty(prop.TEXT, `${getText('signalQuality')}: ${qText} ${avg}`);
        
        let color = 0xff3b30; // weak
        if (quality === 'good') color = 0xffcc00;
        if (quality === 'excellent') color = 0x00ff88;
        this.data.widgets.signalText.setProperty(prop.COLOR, color);
    }

    // Update Counts
    if (this.data.widgets.countText) {
        const vLabel = getText('visible') || 'Vis';
        const uLabel = getText('used') || 'Used';
        this.data.widgets.countText.setProperty(prop.TEXT, `${vLabel}: ${this.data.visibleCount} | ${uLabel}: ${this.data.usedCount}`);
    }

    // Update System Breakdown List
    if (this.data.widgets.sysList) {
        let listData = [];
        const allSystems = ['GPS', 'BDS', 'GLONASS', 'GALILEO', 'QZSS', 'IRNSS'];
        
        allSystems.forEach(sys => {
            const count = this.data.systemCounts[sys] || 0;
            listData.push({ text: `${sys}: ${count}` });
        });
        
        if (this.data.systemCounts['Others'] > 0) {
            listData.push({ text: `Others: ${this.data.systemCounts['Others']}` });
        }

        this.data.widgets.sysList.setProperty(prop.UPDATE_DATA, {
            data_array: listData,
            data_count: listData.length,
            data_type_config: [{ start: 0, end: listData.length - 1, type_id: 1 }],
            data_type_config_count: 1
        });
    }
  },

  onDestroy() {
    if (this.data.geolocation) {
      this.data.geolocation.stop();
    }
  }
});
