import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop, text_style } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";
import { getText } from '@zos/i18n';
import { localStorage } from '@zos/storage';
import { push } from '@zos/router';

const logger = log.getLogger("hamgis-history");

Page({
  data: {
    measurements: [],  // 测量记录列表
    currentIndex: 0,   // 当前显示的记录索引
    widgets: {},
    scrollY: 0,        // 滚动位置
    itemHeight: px(120) // 每个记录项的高度
  },

  // 加载历史记录
  loadMeasurements() {
    try {
      const stored = localStorage.getItem('hamgis_measurements');
      if (stored) {
        const measurements = JSON.parse(stored);
        // 验证数据格式
        if (Array.isArray(measurements)) {
          this.data.measurements = measurements;
          // 按时间倒序排列
          this.data.measurements.sort((a, b) => b.timestamp - a.timestamp);
        } else {
          logger.warn('历史记录数据格式无效');
          this.data.measurements = [];
        }
      } else {
        this.data.measurements = [];
      }
      
      logger.debug(`加载了 ${this.data.measurements.length} 条历史记录`);
    } catch (e) {
      logger.error(`加载历史记录失败: ${e}`);
      this.data.measurements = [];
    }
  },

  // 删除记录
  deleteMeasurement(index) {
    if (index < 0 || index >= this.data.measurements.length) {
      return;
    }
    
    try {
      // 从数组中移除
      this.data.measurements.splice(index, 1);
      
      // 保存到localStorage - 使用统一键名
      localStorage.setItem('hamgis_measurements', JSON.stringify(this.data.measurements));
      
      // 调整当前索引
      if (this.data.currentIndex >= this.data.measurements.length && this.data.measurements.length > 0) {
        this.data.currentIndex = this.data.measurements.length - 1;
      } else if (this.data.measurements.length === 0) {
        this.data.currentIndex = 0;
      }
      
      logger.debug(`删除记录成功，剩余 ${this.data.measurements.length} 条`);
      this.updateUI();
    } catch (e) {
      logger.error(`删除记录失败: ${e}`);
    }
  },

  // 格式化面积显示
  formatArea(area) {
    if (!area) return `0.00 ${getText('mu')}`;

    const mu = area.mu || (area.squareMeters * 0.0015);
    return `${mu.toFixed(2)} ${getText('mu')}`;
  },

  // 格式化日期显示
  formatDate(timestamp) {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  },

  // 上一条记录
  previousRecord() {
    if (this.data.measurements.length === 0) return;
    
    this.data.currentIndex = Math.max(0, this.data.currentIndex - 1);
    this.updateUI();
  },

  // 下一条记录
  nextRecord() {
    if (this.data.measurements.length === 0) return;
    
    this.data.currentIndex = Math.min(this.data.measurements.length - 1, this.data.currentIndex + 1);
    this.updateUI();
  },

  // 更新UI显示
  updateUI() {
    if (this.data.measurements.length === 0) {
      // 显示无数据状态
      if (this.data.widgets.recordInfo) {
        this.data.widgets.recordInfo.setProperty(prop.TEXT, getText('noData'));
      }
      if (this.data.widgets.areaDisplay) {
        this.data.widgets.areaDisplay.setProperty(prop.TEXT, `0.00 ${getText('mu')}`);
      }
      if (this.data.widgets.detailsText) {
        this.data.widgets.detailsText.setProperty(prop.TEXT, getText('noData'));
      }
      if (this.data.widgets.statusText) {
        this.data.widgets.statusText.setProperty(prop.TEXT, `0/0`);
        this.data.widgets.statusText.setProperty(prop.COLOR, 0x666666);
      }
      return;
    }
    
    const current = this.data.measurements[this.data.currentIndex];
    
    // 更新记录信息
    if (this.data.widgets.recordInfo) {
      const recordText = `${current.name || getText('unnamed')}\n${this.formatDate(current.timestamp)}`;
      this.data.widgets.recordInfo.setProperty(prop.TEXT, recordText);
    }
    
    // 更新面积显示
    if (this.data.widgets.areaDisplay) {
      this.data.widgets.areaDisplay.setProperty(prop.TEXT, this.formatArea(current.area));
    }
    
    // 更新详细信息
    if (this.data.widgets.detailsText) {
      const points = current.points ? current.points.length : 0;
      const perimeter = current.perimeter ? (current.perimeter / 1000).toFixed(2) : '0.00';
      const accuracy = current.accuracy || 5;
      
      const detailsText = `${getText('points')}: ${points}\n${getText('perimeter')}: ${perimeter} km\n${getText('accuracy')}: ±${accuracy}m`;
      this.data.widgets.detailsText.setProperty(prop.TEXT, detailsText);
    }
    
    // 更新状态文字
    if (this.data.widgets.statusText) {
      const statusText = `${this.data.currentIndex + 1}/${this.data.measurements.length}`;
      this.data.widgets.statusText.setProperty(prop.TEXT, statusText);
      this.data.widgets.statusText.setProperty(prop.COLOR, 0xffffff);
    }
  },

  onInit() {
    logger.debug("历史记录页面初始化");
    
    // 加载数据
    this.loadMeasurements();
  },

  build() {
    logger.debug("构建历史记录页面UI");
    
    const deviceInfo = getDeviceInfo();
    const { width, height } = deviceInfo;
    
    // 背景
    createWidget(widget.FILL_RECT, {
      x: 0,
      y: 0,
      w: width,
      h: height,
      color: 0x000000
    });
    
    // 标题
    createWidget(widget.TEXT, {
      x: 0,
      y: px(40),
      w: width,
      h: px(40),
      color: 0xffffff,
      text_size: px(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: getText('history')
    });
    
    // 总记录数（放在标题上面）
    this.data.widgets.statusText = createWidget(widget.TEXT, {
      x: 0,
      y: px(15),
      w: width,
      h: px(20),
      color: 0x666666,
      text_size: px(14),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "0/0"
    });
    
    // 记录信息 (名称和时间)
    this.data.widgets.recordInfo = createWidget(widget.TEXT, {
      x: 0,
      y: px(90),
      w: width,
      h: px(70),
      color: 0xcccccc,
      text_size: px(24), // 增大字体
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: getText('noData')
    });
    
    // 面积显示 (大字体 - 默认大字模式)
    this.data.widgets.areaDisplay = createWidget(widget.TEXT, {
      x: 0,
      y: px(170),
      w: width,
      h: px(100),
      color: 0x80caff,
      text_size: px(72), // 增大字体
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.BOLD,
      text: `0.00 ${getText('mu')}`
    });
    
    // 详细信息
    this.data.widgets.detailsText = createWidget(widget.TEXT, {
      x: 0,
      y: px(280),
      w: width,
      h: px(90),
      color: 0xffffff,
      text_size: px(22), // 增大字体
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "暂无测量记录"
    });
    
    // 导航按钮区域
    const buttonY = px(390);
    const buttonW = px(80);
    const buttonH = px(60); // 增大按钮高度 (60px)
    
    // 上一条按钮
    createWidget(widget.BUTTON, {
      x: px(20),
      y: buttonY,
      w: buttonW,
      h: buttonH,
      radius: px(30), // Pill Shape
      normal_color: 0x2b2d31, // M3 Surface Container
      press_color: 0x3e4248,
      text: "◀",
      text_size: px(24),
      click_func: () => {
        this.previousRecord();
      }
    });
    
    // 详情按钮
    createWidget(widget.BUTTON, {
      x: px(20) + buttonW + px(10),
      y: buttonY, // 放在同一行，中间
      w: width - px(60) - (buttonW * 2), // 自动计算宽度
      h: buttonH,
      radius: px(30),
      normal_color: 0x0986d4, // M3 Blue Primary
      press_color: 0x0061a4,
      text: (getText('btn_view_details') || "查看详情"),
      text_size: px(20),
      color: 0xffffff,
      click_func: () => {
        if (this.data.measurements.length > 0) {
          const current = this.data.measurements[this.data.currentIndex];
          try {
            // 使用push跳转到项目详情页
            push({
              url: 'page/project-detail/index.page',
              params: JSON.stringify(current)
            });
          } catch (e) {
            logger.error(`跳转详情页失败: ${e}`);
          }
        }
      }
    });

    // 下一条按钮
    createWidget(widget.BUTTON, {
      x: width - px(20) - buttonW,
      y: buttonY,
      w: buttonW,
      h: buttonH,
      radius: px(30),
      normal_color: 0x2b2d31, // M3 Surface Container
      press_color: 0x3e4248,
      text: "▶",
      text_size: px(24),
      click_func: () => {
        this.nextRecord();
      }
    });

    // 删除按钮 (放在最下方)
    createWidget(widget.BUTTON, {
      x: px(40),
      y: buttonY + buttonH + px(15),
      w: width - px(80),
      h: buttonH,
      radius: px(30),
      normal_color: 0xb3261e, // M3 Error Color
      press_color: 0x8c1d18,
      text: getText('delete'),
      text_size: px(20),
      click_func: () => {
        if (this.data.measurements.length > 0) {
          this.deleteMeasurement(this.data.currentIndex);
        }
      }
    });
    
    // 圆屏额外：在删除按钮下方增加空白区域
    if (width >= 480) {
      const extraSpaceY = buttonY + buttonH + px(15) + buttonH + px(10);
      createWidget(widget.FILL_RECT, {
        x: 0,
        y: extraSpaceY,
        w: width,
        h: px(100), 
        color: 0x000000 
      });
    }
    
    // 初始化UI
    this.updateUI();
  },

  onDestroy() {
    logger.debug("历史记录页面销毁");
  }
});