import { log, px } from "@zos/utils";
import { createWidget, widget, align, text_style } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { back } from '@zos/router';
import { getText } from '@zos/i18n';
import { formatDate, formatTime } from '../../utils/formatters.js';

const logger = log.getLogger("hamgis-project-detail");

Page({
  data: {
    project: null,         // 当前项目数据
    isBuilt: false,        // 防止重复构建
  },
  
  /**
   * 页面初始化
   */
  onInit(params) {
    logger.debug("项目详情页初始化");
    
    try {
      // 从路由参数获取项目数据
      if (params) {
        this.data.project = JSON.parse(params);
        logger.debug(`加载项目: ${this.data.project.name}`);
      } else {
        logger.error("未接收到项目数据");
      }
    } catch (e) {
      logger.error(`解析项目数据失败: ${e}`);
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
    const cardHeight = px(150);
    const cardX = isRoundScreen ? px(40) : px(10);
    const cardW = isRoundScreen ? width - px(80) : width - px(20);
    
    // 卡片背景
    createWidget(widget.FILL_RECT, {
      x: cardX,
      y: startY,
      w: cardW,
      h: cardHeight,
      radius: px(10),
      color: 0x1a1a1a
    });
    
    // 项目信息
    const dateStr = formatDate(this.data.project.timestamp);
    const statusText = this.data.project.status === 'completed' ?
      `✓ ${getText('completed') || '已完成'}` :
      getText('draft') || '草稿';
    const statusColor = this.data.project.status === 'completed' ? 0x00ff88 : 0xffaa00;
    
    // 第一行：日期和状态
    createWidget(widget.TEXT, {
      x: cardX + px(10),
      y: startY + px(10),
      w: (cardW - px(30)) / 2,
      h: px(20),
      color: 0x888888,
      text_size: px(12),
      align_h: align.LEFT,
      text: `📅 ${dateStr}`
    });
    
    createWidget(widget.TEXT, {
      x: cardX + px(10) + (cardW - px(30)) / 2,
      y: startY + px(10),
      w: (cardW - px(30)) / 2,
      h: px(20),
      color: statusColor,
      text_size: px(12),
      align_h: align.RIGHT,
      text: statusText
    });
    
    // 第二行：点数和面积
    createWidget(widget.TEXT, {
      x: cardX + px(10),
      y: startY + px(35),
      w: cardW - px(20),
      h: px(20),
      color: 0xcccccc,
      text_size: px(14),
      align_h: align.LEFT,
      text: `📍 ${getText('points') || '点数'}: ${this.data.project.pointCount}${getText('individual') || '个'}`
    });
    
    // 第三行：面积
    const area = this.data.project.area;
    const areaText = `📐 ${getText('area') || '面积'}: ${area.mu.toFixed(2)}${getText('mu') || '亩'} (${area.squareMeters.toFixed(0)}㎡)`;
    createWidget(widget.TEXT, {
      x: cardX + px(10),
      y: startY + px(60),
      w: cardW - px(20),
      h: px(20),
      color: 0x80caff,
      text_size: px(14),
      align_h: align.LEFT,
      text: areaText
    });
    
    // 第四行：周长和精度
    createWidget(widget.TEXT, {
      x: cardX + px(10),
      y: startY + px(85),
      w: (cardW - px(30)) / 2,
      h: px(20),
      color: 0x88ccff,
      text_size: px(12),
      align_h: align.LEFT,
      text: `${getText('perimeter') || '周长'}: ${this.data.project.perimeter.toFixed(1)}m`
    });
    
    createWidget(widget.TEXT, {
      x: cardX + px(10) + (cardW - px(30)) / 2,
      y: startY + px(85),
      w: (cardW - px(30)) / 2,
      h: px(20),
      color: 0x888888,
      text_size: px(12),
      align_h: align.RIGHT,
      text: `${getText('accuracy') || '精度'}: ±${this.data.project.accuracy}m`
    });
    
    // 查看地图按钮 - 确保只创建一次，位置固定
    createWidget(widget.BUTTON, {
      x: cardX + (cardW - px(120)) / 2,
      y: startY + px(115),
      w: px(120),
      h: px(30),
      radius: px(15),
      normal_color: 0x0986d4,
      press_color: 0x0061a4,
      text: `🗺️ ${getText('viewMap') || '查看地图'}`,
      text_size: px(12),
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
  },
  
  /**
   * 构建点详情表格 - 弹性长度
   */
  buildPointDetailsTable(width, height, isRoundScreen) {
    const cardX = isRoundScreen ? px(40) : px(10);
    const cardW = isRoundScreen ? width - px(80) : width - px(20);
    
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
    const startY = isRoundScreen ? px(240) : px(200);
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
          color: 0x88ccff,
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
    const bottomSpace = totalHeight;
    if (bottomSpace < height) {
      // 如果总高度小于屏幕高度，增加空白让页面可以滚动
      const extraSpace = height - bottomSpace + px(20);
      createWidget(widget.FILL_RECT, {
        x: 0,
        y: totalHeight,
        w: width,
        h: extraSpace,
        color: 0x0a0a0a
      });
    }
    
    logger.debug(`点详情表格创建完成，显示${visiblePoints.length}/${points.length}个点，总高度: ${totalHeight}px`);
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
      text: "加载项目失败\n请返回重试"
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