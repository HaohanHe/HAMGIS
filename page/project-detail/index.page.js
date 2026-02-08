import { log, px } from "@zos/utils";
import { createWidget, widget, align, text_style } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { back, push } from '@zos/router';
import { getText } from '@zos/i18n';
import { localStorage } from '@zos/storage';
import { formatDate, formatTime } from '../../utils/formatters.js';
import { onKey, KEY_SHORTCUT, KEY_BACK, KEY_EVENT_CLICK } from '@zos/interaction';

const logger = log.getLogger("hamgis-project-detail");

Page({
  data: {
    project: null,         // 当前项目数据
    isBuilt: false,        // 防止重复构建
    highContrast: false    // 高对比度模式
  },
  
  /**
   * 页面初始化
   */
  onInit(params) {
    logger.debug("项目详情页初始化");
    logger.debug(`接收到的params: ${params}`);
    
    // 加载设置
    try {
      const stored = localStorage.getItem('hamgis_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings && settings.highContrast) {
          this.data.highContrast = true;
        }
      }
    } catch (e) {
      logger.error(`加载设置失败: ${e}`);
    }
    
    try {
      // 从路由参数获取项目数据
      if (params) {
        this.data.project = JSON.parse(params);
        logger.debug(`加载项目成功: ${this.data.project.name}, 点数: ${this.data.project.pointCount}`);
        
        // 验证数据完整性 - 支持测面积项目(points)和GIS项目(features)
        const isGISProject = this.data.project.recordType === 'gis_project' || 
                            (this.data.project.features && Array.isArray(this.data.project.features));
        
        if (isGISProject) {
          // GIS项目验证 features 数组
          if (!this.data.project.features || !Array.isArray(this.data.project.features)) {
            logger.error("GIS项目数据缺少 features 数组");
            this.data.project = null;
          } else if (this.data.project.features.length === 0) {
            logger.error("GIS项目 features 数组为空");
            this.data.project = null;
          } else {
            logger.debug(`加载GIS项目成功: ${this.data.project.name}, 要素数: ${this.data.project.features.length}`);
          }
        } else {
          // 测面积项目验证 points 数组
          if (!this.data.project.points || !Array.isArray(this.data.project.points)) {
            logger.error("项目数据缺少 points 数组");
            this.data.project = null;
          } else if (this.data.project.points.length === 0) {
            logger.error("项目 points 数组为空");
            this.data.project = null;
          }
        }
      } else {
        logger.error("未接收到项目数据");
        this.data.project = null;
      }
    } catch (e) {
      logger.error(`解析项目数据失败: ${e}, params: ${params}`);
      this.data.project = null;
    }
  },
  
  /**
   * 构建页面UI
   */
  build() {
    logger.debug("构建项目详情页UI");
    
    // 防止重复构建
    if (this.data.isBuilt) {
      logger.debug("页面已构建，跳过重复构建");
      return;
    }
    
    if (!this.data.project) {
      this.buildErrorState();
      return;
    }
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    const isRoundScreen = deviceInfo.width >= 480;
    
    // 背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x0a0a0a
    });
    
    // 构建各个区域
    this.buildHeader(width, isRoundScreen);
    this.buildProjectSummary(width, isRoundScreen);
    this.buildPointDetailsTable(width, height, isRoundScreen);
    
    // 标记已构建
    this.data.isBuilt = true;
  },
  
  /**
   * 构建标题栏
   */
  buildHeader(width, isRoundScreen) {
    const headerHeight = px(60);
    const startY = isRoundScreen ? px(30) : 0;
    
    // 标题栏背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: startY,
      w: width,
      h: headerHeight,
      color: 0x1a1a1a
    });
    
    // 返回按钮
    const btnX = isRoundScreen ? px(60) : px(10);
    createWidget(widget.BUTTON, {
      x: btnX,
      y: startY + px(15),
      w: px(60),
      h: px(30),
      radius: px(15),
      normal_color: 0x333333,
      press_color: 0x555555,
      text: "←",
      text_size: px(20),
      color: 0xffffff,
      click_func: () => {
        try {
          back();
        } catch (e) {
          logger.error(`返回失败: ${e}`);
        }
      }
    });
    
    // 项目名称
    const titleX = isRoundScreen ? px(130) : px(80);
    const titleW = isRoundScreen ? width - px(140) : width - px(90);
    createWidget(widget.TEXT, {
      x: titleX,
      y: startY,
      w: titleW,
      h: headerHeight,
      color: 0xffffff,
      text_size: px(22),
      align_h: align.LEFT,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: this.data.project.name || "未命名项目"
    });
  },
  
  /**
   * 构建项目摘要信息
   */
  buildProjectSummary(width, isRoundScreen) {
    const startY = isRoundScreen ? px(100) : px(70);
    const isGISProject = this.data.project.recordType === 'gis_project';
    const cardHeight = isGISProject ? px(200) : px(250); // GIS项目卡片稍矮
    const cardX = isRoundScreen ? px(40) : px(10);
    const cardW = isRoundScreen ? width - px(80) : width - px(20);
    
    // Card Background
    createWidget(widget.FILL_RECT, {
      x: cardX,
      y: startY,
      w: cardW,
      h: cardHeight,
      radius: px(15),
      color: 0x1a1a1a
    });
    
    // Project Info
    const dateStr = formatDate(this.data.project.timestamp);
    const statusText = this.data.project.status === 'completed' ?
      `✓ ${getText('completed') || '已完成'}` :
      getText('draft') || '草稿';
    const statusColor = this.data.project.status === 'completed' ? 0x00ff88 : 0xffaa00;
    
    // Row 1: Date & Status
    createWidget(widget.TEXT, {
      x: cardX + px(15),
      y: startY + px(15),
      w: (cardW - px(30)) / 2,
      h: px(20),
      color: 0x888888,
      text_size: px(12),
      align_h: align.LEFT,
      text: `📅 ${dateStr}`
    });
    
    createWidget(widget.TEXT, {
      x: cardX + px(10) + (cardW - px(30)) / 2,
      y: startY + px(15),
      w: (cardW - px(25)),
      h: px(20),
      color: statusColor,
      text_size: px(12),
      align_h: align.RIGHT,
      text: statusText
    });
    
    if (isGISProject) {
      // GIS项目显示要素统计
      const fc = this.data.project.featureCount || { point: 0, line: 0, polygon: 0 };
      const totalPoints = this.data.project.totalPoints || 0;
      
      // Row 2: 要素统计
      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(45),
        w: cardW - px(30),
        h: px(20),
        color: 0xcccccc,
        text_size: px(14),
        align_h: align.LEFT,
        text: `📊 ${getText('element') || 'Element'}: ${getText('point') || 'Point'}×${fc.point} ${getText('line') || 'Line'}×${fc.line} ${getText('polygon') || 'Polygon'}×${fc.polygon}`
      });
      
      // Row 3: 总点数
      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(70),
        w: cardW - px(30),
        h: px(20),
        color: 0x80caff,
        text_size: px(14),
        align_h: align.LEFT,
        text: `📍 ${getText('totalPoints') || 'Total Points'}: ${totalPoints}`
      });
      
    } else {
      // 测面积项目显示面积信息
      // Row 2: Points & Area
      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(45),
        w: cardW - px(30),
        h: px(20),
        color: 0xcccccc,
        text_size: px(14),
        align_h: align.LEFT,
        text: `📍 ${getText('points') || '点数'}: ${this.data.project.pointCount}${getText('individual') || '个'}`
      });
      
      // Row 3: Area - 根据保存的单位显示
      const area = this.data.project.area;
      const primaryUnit = this.data.project.primaryUnit || 'mu'; // 默认使用亩
      let areaValue, areaUnit;
      
      switch (primaryUnit) {
        case 'hectare':
          areaValue = area.hectares !== undefined ? area.hectares : (area.squareMeters * 0.0001);
          areaUnit = getText('hectare') || '公顷';
          break;
        case 'acre':
          areaValue = area.acres !== undefined ? area.acres : (area.squareMeters * 0.000247105);
          areaUnit = getText('acre') || '英亩';
          break;
        case 'squareMile':
          areaValue = area.squareMiles !== undefined ? area.squareMiles : (area.squareMeters * 3.861e-7);
          areaUnit = getText('squareMile') || '平方英里';
          break;
        default: // 'mu'
          areaValue = area.mu !== undefined ? area.mu : (area.squareMeters * 0.0015);
          areaUnit = getText('mu') || '亩';
      }
      
      const areaText = `📐 ${getText('area') || '面积'}: ${areaValue.toFixed(2)}${areaUnit} (${area.squareMeters.toFixed(0)}㎡)`;
      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(70),
        w: cardW - px(30),
        h: px(20),
        color: 0x80caff,
        text_size: px(14),
        align_h: align.LEFT,
        text: areaText
      });
      
      // Row 4: Perimeter & Accuracy
      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(95),
        w: cardW - px(30),
        h: px(20),
        color: 0x88ccff,
        text_size: px(12),
        align_h: align.LEFT,
        text: `${getText('perimeter') || '周长'}: ${this.data.project.perimeter.toFixed(1)}m`
      });

      createWidget(widget.TEXT, {
        x: cardX + px(15),
        y: startY + px(115),
        w: cardW - px(30),
        h: px(20),
        color: 0x666666,
        text_size: px(11),
        align_h: align.LEFT,
        text: `${getText('accuracy') || '精度'}: ±${this.data.project.accuracy}m`
      });
    }
    
    // Buttons Area
    const btnWidth = px(140);
    const btnHeight = px(36);
    const btnRadius = px(18);
    
    // 根据项目类型调整按钮位置
    const viewMapBtnY = isGISProject ? startY + px(100) : startY + px(150);
    const exportBtnY = isGISProject ? startY + px(145) : startY + px(195);
    
    // View Map Button
    createWidget(widget.BUTTON, {
      x: cardX + (cardW - btnWidth) / 2,
      y: viewMapBtnY,
      w: btnWidth,
      h: btnHeight,
      radius: btnRadius,
      normal_color: 0x0986d4,
      press_color: 0x0061a4,
      text: `🗺️ ${getText('viewMap') || '查看地图'}`,
      text_size: px(14),
      color: 0xffffff,
      click_func: () => {
        try {
          const { push } = require('@zos/router');
          push({
            url: 'page/map/index.page',
            params: JSON.stringify(this.data.project)
          });
        } catch (e) {
          logger.error(`跳转地图页面失败: ${e}`);
        }
      }
    });

    // Export Button
    createWidget(widget.BUTTON, {
      x: cardX + (cardW - btnWidth) / 2,
      y: exportBtnY,
      w: btnWidth,
      h: btnHeight,
      radius: btnRadius,
      normal_color: 0x4caf50,
      press_color: 0x2e7d32,
      text: `📤 ${getText('exportToAndroid') || '导出APP'}`,
      text_size: px(14),
      color: 0xffffff,
      click_func: () => {
        try {
          const { push } = require('@zos/router');
          
          if (this.data.project) {
            // 验证数据完整性 - 根据项目类型验证
            const isGISProject = this.data.project.recordType === 'gis_project';
            
            if (isGISProject) {
              // GIS项目验证 features 数组
              if (!this.data.project.features || !Array.isArray(this.data.project.features)) {
                logger.error("GIS项目数据缺少 features 数组，无法导出");
                return;
              }
              if (this.data.project.features.length === 0) {
                logger.error("GIS项目 features 数组为空，无法导出");
                return;
              }
            } else {
              // 测面积项目验证 points 数组
              if (!this.data.project.points || !Array.isArray(this.data.project.points)) {
                logger.error("项目数据缺少 points 数组，无法导出");
                return;
              }
              if (this.data.project.points.length === 0) {
                logger.error("项目 points 数组为空，无法导出");
                return;
              }
            }
            
            const dataStr = JSON.stringify(this.data.project);
            const dataCount = isGISProject ? 
              this.data.project.features.length : 
              this.data.project.points.length;
            logger.info(`Saving project to storage, length: ${dataStr.length}, ${isGISProject ? 'features' : 'points'}: ${dataCount}`);
            logger.info(`Project name: ${this.data.project.name}, timestamp: ${this.data.project.timestamp}`);
            localStorage.setItem('hamgis_export_data', dataStr);
            
            // 验证保存是否成功
            const saved = localStorage.getItem('hamgis_export_data');
            if (saved && saved.length === dataStr.length) {
              logger.info("数据保存成功，跳转到导出页面");
            } else {
              logger.error("数据保存失败或长度不匹配");
              return;
            }
          } else {
            logger.error("Project data is null!");
            return;
          }
          
          push({
            url: 'page/export/index.page',
            params: '' 
          });
        } catch (e) {
          logger.error(`跳转导出页面失败: ${e}`);
        }
      }
    });
  },
  
  /**
   * 构建点详情表格 - 弹性长度
   */
  buildPointDetailsTable(width, height, isRoundScreen) {
    const cardX = isRoundScreen ? px(40) : px(10);
    const cardW = isRoundScreen ? width - px(80) : width - px(20);
    
    // 判断是否为GIS项目
    const isGISProject = this.data.project?.recordType === 'gis_project';
    
    if (isGISProject) {
      // GIS项目显示要素列表
      this.buildGISFeaturesTable(width, height, isRoundScreen, cardX, cardW);
      return;
    }
    
    // 测面积项目显示点位列表
    const points = this.data.project?.points || [];
    
    // 计算表格所需高度
    const rowHeight = px(30);
    const headerHeight = px(35);
    const titleHeight = px(25);
    const spacing = px(10);
    
    let tableHeight = 0;
    let visiblePoints = [];
    
    if (points.length === 0) {
      // 无数据时的高度
      tableHeight = px(80);
    } else {
      // 计算完整表格高度
      const fullTableHeight = headerHeight + points.length * rowHeight;
      
      // 检查是否需要滚动（圆屏）
      if (isRoundScreen && fullTableHeight > px(300)) {
        // 限制最大显示高度，其余滚动
        const maxRows = Math.floor(px(300) / rowHeight);
        visiblePoints = points.slice(0, maxRows);
        tableHeight = headerHeight + visiblePoints.length * rowHeight;
      } else {
        visiblePoints = points;
        tableHeight = fullTableHeight;
      }
    }
    
    // 计算页面总高度（从项目摘要结束位置开始）
    // Summary Card: Y = 100/70, Height = 250/200
    const isGIS = this.data.project?.recordType === 'gis_project';
    const summaryCardHeight = isGIS ? px(200) : px(250);
    const summaryEndY = (isRoundScreen ? px(100) : px(70)) + summaryCardHeight;
    const startY = summaryEndY + px(20);
    const totalHeight = startY + titleHeight + spacing + tableHeight + spacing + px(20);
    
    // 表格起始位置
    const tableStartY = startY;
    
    // 标题
    createWidget(widget.TEXT, {
      x: cardX,
      y: tableStartY,
      w: cardW,
      h: titleHeight,
      color: 0xffffff,
      text_size: px(16),
      align_h: align.LEFT,
      text_style: text_style.BOLD,
      text: `📊 ${getText('pointDetailsTable') || '点位详情表'}`
    });
    
    if (points.length === 0) {
      // 无数据提示
      createWidget(widget.TEXT, {
        x: cardX,
        y: tableStartY + titleHeight + spacing,
        w: cardW,
        h: tableHeight,
        color: 0x666666,
        text_size: px(14),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: getText('noCoordData') || '暂无坐标数据'
      });
    } else {
      // 表格背景
      createWidget(widget.FILL_RECT, {
        x: cardX,
        y: tableStartY + titleHeight + spacing,
        w: cardW,
        h: tableHeight,
        radius: px(16), // Increased radius
        color: 0x1c1b1f // M3 Surface
      });
      
      // 表头
      const headerY = tableStartY + titleHeight + spacing + px(5);
      const colWidths = isRoundScreen ?
        [px(50), px(80), px(130), px(60)] :
        [px(40), px(70), px(110), px(50)];
      
      const colX = [
        cardX + px(5),
        cardX + px(5) + colWidths[0],
        cardX + px(5) + colWidths[0] + colWidths[1],
        cardX + px(5) + colWidths[0] + colWidths[1] + colWidths[2]
      ];
      
      // 表头背景
      createWidget(widget.FILL_RECT, {
        x: cardX + px(2),
        y: headerY - px(2),
        w: cardW - px(4),
        h: px(30),
        radius: px(12),
        color: 0x2b2d31 // Surface Container
      });
      
      // 表头文字
      const headers = [
        getText('serialNumber') || '序号', 
        getText('time') || '时间', 
        getText('position') || '位置', 
        getText('height') || '高度'
      ];
      headers.forEach((header, i) => {
        createWidget(widget.TEXT, {
          x: colX[i],
          y: headerY,
          w: colWidths[i],
          h: px(26),
          color: 0xffffff,
          text_size: px(12),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.BOLD,
          text: header
        });
      });
      
      // 表格数据行
      visiblePoints.forEach((point, index) => {
        const rowY = headerY + px(30) + index * rowHeight;
        
        // 行背景（交替颜色）
        if (index % 2 === 1) {
          createWidget(widget.FILL_RECT, {
            x: cardX + px(2),
            y: rowY - px(1),
            w: cardW - px(4),
            h: rowHeight - px(2),
            color: 0x25232a // Slightly lighter surface
          });
        }
        
        // 序号
        createWidget(widget.TEXT, {
          x: colX[0],
          y: rowY,
          w: colWidths[0],
          h: rowHeight - px(4),
          color: index === 0 ? 0xffb4ab : 0x80caff, // Error color for first, Blue for others
          text_size: px(12),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.BOLD,
          text: `${index + 1}`
        });
        
        // 时间
        const timeText = formatTime(point.timestamp);
        createWidget(widget.TEXT, {
          x: colX[1],
          y: rowY,
          w: colWidths[1],
          h: rowHeight - px(4),
          color: 0xcccccc,
          text_size: px(10),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: timeText
        });
        
        // 位置
        const coordText = `${point.lat.toFixed(4)},${point.lon.toFixed(4)}`;
        createWidget(widget.TEXT, {
          x: colX[2],
          y: rowY,
          w: colWidths[2],
          h: rowHeight - px(4),
          color: this.data.highContrast ? 0xffffff : 0x88ccff,
          text_size: px(9),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: coordText
        });
        
        // 高度
        const altitudeText = point.altitude !== null && point.altitude !== undefined
          ? `${Math.round(point.altitude)}m`
          : '--';
        createWidget(widget.TEXT, {
          x: colX[3],
          y: rowY,
          w: colWidths[3],
          h: rowHeight - px(4),
          color: 0xffaa00,
          text_size: px(11),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: altitudeText
        });
      });
      
      // 如果有更多数据，显示提示
      if (points.length > visiblePoints.length) {
        const showingText = `${getText('showingPoints') || '显示前%d个点，共%d个点'}`.replace('%d', visiblePoints.length).replace('%d', points.length);
        createWidget(widget.TEXT, {
          x: cardX,
          y: tableStartY + titleHeight + spacing + tableHeight + px(5),
          w: cardW,
          h: px(15),
          color: 0x888888,
          text_size: px(10),
          align_h: align.CENTER_H,
          text: showingText
        });
      }
    }
    
    // 底部空白区域 - 确保页面可以滚动
    // 强制增加底部额外空间，适应圆屏底部
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: totalHeight,
      w: width,
      h: px(150), // 无条件增加 150px 高度
      color: 0x0a0a0a
    });
    
    logger.debug(`点详情表格创建完成，显示${visiblePoints.length}/${points.length}个点，总高度: ${totalHeight}px`);
  },
  
  /**
   * 构建GIS项目要素列表表格
   */
  buildGISFeaturesTable(width, height, isRoundScreen, cardX, cardW) {
    const features = this.data.project?.features || [];
    
    // 计算表格所需高度
    const rowHeight = px(35);
    const headerHeight = px(35);
    const titleHeight = px(25);
    const spacing = px(10);
    
    let tableHeight = 0;
    let visibleFeatures = [];
    
    if (features.length === 0) {
      // 无数据时的高度
      tableHeight = px(80);
    } else {
      // 计算完整表格高度
      const fullTableHeight = headerHeight + features.length * rowHeight;
      
      // 检查是否需要滚动（圆屏）
      if (isRoundScreen && fullTableHeight > px(300)) {
        // 限制最大显示高度，其余滚动
        const maxRows = Math.floor(px(300) / rowHeight);
        visibleFeatures = features.slice(0, maxRows);
        tableHeight = headerHeight + visibleFeatures.length * rowHeight;
      } else {
        visibleFeatures = features;
        tableHeight = fullTableHeight;
      }
    }
    
    // 计算页面总高度（从项目摘要结束位置开始）
    const summaryEndY = (isRoundScreen ? px(100) : px(70)) + px(200); // GIS项目卡片高度为200
    const startY = summaryEndY + px(20);
    const totalHeight = startY + titleHeight + spacing + tableHeight + spacing + px(20);
    
    // 表格起始位置
    const tableStartY = startY;
    
    // 标题
    createWidget(widget.TEXT, {
      x: cardX,
      y: tableStartY,
      w: cardW,
      h: titleHeight,
      color: 0xffffff,
      text_size: px(16),
      align_h: align.LEFT,
      text_style: text_style.BOLD,
      text: `📊 ${getText('featureList') || '要素列表'}`
    });
    
    if (features.length === 0) {
      // 无数据提示
      createWidget(widget.TEXT, {
        x: cardX,
        y: tableStartY + titleHeight + spacing,
        w: cardW,
        h: tableHeight,
        color: 0x666666,
        text_size: px(14),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: getText('noFeatures') || '暂无要素数据'
      });
    } else {
      // 表格背景
      createWidget(widget.FILL_RECT, {
        x: cardX,
        y: tableStartY + titleHeight + spacing,
        w: cardW,
        h: tableHeight,
        radius: px(16),
        color: 0x1c1b1f
      });
      
      // 表头
      const headerY = tableStartY + titleHeight + spacing + px(5);
      const colWidths = isRoundScreen ?
        [px(60), px(80), px(100), px(80)] :
        [px(50), px(70), px(90), px(70)];
      
      const colX = [
        cardX + px(5),
        cardX + px(5) + colWidths[0],
        cardX + px(5) + colWidths[0] + colWidths[1],
        cardX + px(5) + colWidths[0] + colWidths[1] + colWidths[2]
      ];
      
      // 表头背景
      createWidget(widget.FILL_RECT, {
        x: cardX + px(2),
        y: headerY - px(2),
        w: cardW - px(4),
        h: px(30),
        radius: px(12),
        color: 0x2b2d31
      });
      
      // 表头文字
      const headers = [
        getText('type') || '类型', 
        getText('featureName') || '名称', 
        getText('pointCount') || '点数', 
        getText('length') || '长度'
      ];
      headers.forEach((header, i) => {
        createWidget(widget.TEXT, {
          x: colX[i],
          y: headerY,
          w: colWidths[i],
          h: px(26),
          color: 0xffffff,
          text_size: px(12),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.BOLD,
          text: header
        });
      });
      
      // 表格数据行
      visibleFeatures.forEach((feature, index) => {
        const rowY = headerY + px(30) + index * rowHeight;
        
        // 行背景（交替颜色）
        if (index % 2 === 1) {
          createWidget(widget.FILL_RECT, {
            x: cardX + px(2),
            y: rowY - px(1),
            w: cardW - px(4),
            h: rowHeight - px(2),
            color: 0x25232a
          });
        }
        
        // 类型
        const typeText = feature.featureType === 'point' ? '点' : 
                        feature.featureType === 'line' ? '线' : '面';
        const typeColor = feature.featureType === 'point' ? 0xff6b6b :
                         feature.featureType === 'line' ? 0x4ecdc4 : 0x45b7d1;
        createWidget(widget.TEXT, {
          x: colX[0],
          y: rowY,
          w: colWidths[0],
          h: rowHeight - px(4),
          color: typeColor,
          text_size: px(12),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.BOLD,
          text: typeText
        });
        
        // 名称
        createWidget(widget.TEXT, {
          x: colX[1],
          y: rowY,
          w: colWidths[1],
          h: rowHeight - px(4),
          color: 0xcccccc,
          text_size: px(11),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: feature.featureName || `${getText('element') || 'Element'}${index + 1}`
        });
        
        // 点数
        const pointCount = feature.featureType === 'point' ? 1 : 
                          (feature.coords?.length || 0);
        createWidget(widget.TEXT, {
          x: colX[2],
          y: rowY,
          w: colWidths[2],
          h: rowHeight - px(4),
          color: this.data.highContrast ? 0xffffff : 0x88ccff,
          text_size: px(12),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: `${pointCount}`
        });
        
        // 长度/面积
        let lengthText = '--';
        if (feature.featureType === 'line') {
          lengthText = feature.length ? `${feature.length.toFixed(1)}m` : '--';
        } else if (feature.featureType === 'polygon') {
          lengthText = feature.perimeter ? `${feature.perimeter.toFixed(1)}m` : '--';
        }
        createWidget(widget.TEXT, {
          x: colX[3],
          y: rowY,
          w: colWidths[3],
          h: rowHeight - px(4),
          color: 0xffaa00,
          text_size: px(11),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: lengthText
        });
      });
      
      // 如果有更多数据，显示提示
      if (features.length > visibleFeatures.length) {
        const showingText = `显示前${visibleFeatures.length}个要素，共${features.length}个`;
        createWidget(widget.TEXT, {
          x: cardX,
          y: tableStartY + titleHeight + spacing + tableHeight + px(5),
          w: cardW,
          h: px(15),
          color: 0x888888,
          text_size: px(10),
          align_h: align.CENTER_H,
          text: showingText
        });
      }
    }
    
    // 底部空白区域
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: totalHeight,
      w: width,
      h: px(150),
      color: 0x0a0a0a
    });
    
    logger.debug(`GIS要素表格创建完成，显示${visibleFeatures.length}/${features.length}个要素，总高度: ${totalHeight}px`);
    
    // 注册按键监听
    // 下键(Shortcut/Back): 返回功能 - 全局可用
    onKey({
      callback: (key, keyEvent) => {
        if (keyEvent === KEY_EVENT_CLICK) {
          // 下键：返回首页 - 全局可用
          if (key === KEY_SHORTCUT || key === KEY_BACK) {
            logger.debug(`Shortcut/Back key triggered back: ${key}`);
            // 执行返回操作
            back();
            return true; // 拦截按键事件
          }
        }
        return false;
      }
    });
  },
  
  /**
   * 构建错误状态
   */
  buildErrorState() {
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x0a0a0a
    });
    
    createWidget(widget.TEXT, {
      x: 0,
      y: height / 2 - px(40),
      w: width,
      h: px(80),
      color: 0xff3b30,
      text_size: px(20),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: getText('loadProjectFailed') || "加载项目失败\n请返回重试"
    });
    
    // 返回按钮
    createWidget(widget.BUTTON, {
      x: (width - px(120)) / 2,
      y: height / 2 + px(60),
      w: px(120),
      h: px(40),
      radius: px(20),
      normal_color: 0x333333,
      press_color: 0x555555,
      text: getText('back') || '返回',
      text_size: px(16),
      color: 0xffffff,
      click_func: () => {
        try {
          back();
        } catch (e) {
          logger.error(`返回失败: ${e}`);
        }
      }
    });
  },
  
  /**
   * 页面销毁
   */
  onDestroy() {
    logger.debug("项目详情页销毁");
    // 重置构建状态
    this.data.isBuilt = false;
  }
});