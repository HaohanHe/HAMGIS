// 测试按钮事件处理的简单页面
import { log, px } from "@zos/utils";
import { createWidget, widget, align, prop } from '@zos/ui';
import { getDeviceInfo } from "@zos/device";

const logger = log.getLogger("test-buttons");

Page({
  data: {
    clickCount: 0,
    widgets: {}
  },

  // 测试方法
  testMethod() {
    this.data.clickCount++;
    logger.debug(`按钮被点击了 ${this.data.clickCount} 次`);
    
    if (this.data.widgets.counterText) {
      this.data.widgets.counterText.setProperty(prop.TEXT, `点击次数: ${this.data.clickCount}`);
    }
  },

  build() {
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
      y: px(50),
      w: width,
      h: px(40),
      color: 0xffffff,
      text_size: px(24),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "按钮测试页面"
    });
    
    // 计数器显示
    this.data.widgets.counterText = createWidget(widget.TEXT, {
      x: 0,
      y: px(150),
      w: width,
      h: px(40),
      color: 0x00ff00,
      text_size: px(20),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: `点击次数: ${this.data.clickCount}`
    });
    
    // 使用闭包保存页面实例引用 - 正确的方式
    const pageInstance = this;
    
    // 测试按钮 - 使用闭包
    createWidget(widget.BUTTON, {
      x: (width - px(200)) / 2,
      y: px(250),
      w: px(200),
      h: px(60),
      radius: px(30),
      normal_color: 0x0088ff,
      press_color: 0x0066cc,
      text: "点击测试",
      text_size: px(18),
      color: 0xffffff,
      click_func: (button_widget) => {
        try {
          pageInstance.testMethod();
        } catch (e) {
          logger.error(`按钮点击失败: ${e}`);
        }
      }
    });
    
    // 错误的方式 - 会导致this上下文丢失
    createWidget(widget.BUTTON, {
      x: (width - px(200)) / 2,
      y: px(350),
      w: px(200),
      h: px(60),
      radius: px(30),
      normal_color: 0xff3333,
      press_color: 0xcc2222,
      text: "错误方式",
      text_size: px(18),
      color: 0xffffff,
      click_func: () => {
        try {
          // 这种方式会失败，因为this上下文丢失
          this.testMethod();
        } catch (e) {
          logger.error(`错误方式按钮点击失败: ${e}`);
        }
      }
    });
    
    // 说明文字
    createWidget(widget.TEXT, {
      x: 0,
      y: px(450),
      w: width,
      h: px(60),
      color: 0x888888,
      text_size: px(14),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text: "蓝色按钮使用正确的闭包方式\n红色按钮使用错误的this方式"
    });
  }
});