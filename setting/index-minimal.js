// HAMGIS 设置应用 - 极简测试版本入口
// 对应 index-minimal.html

(() => {
  const logger = console
  
  logger.log('HAMGIS设置应用(极简测试版)JS入口加载')
  
  // Settings App在Zepp App的WebView中运行
  // 主要UI和逻辑在index-minimal.html中
  
  try {
    // 检查环境
    if (typeof localStorage !== 'undefined') {
      logger.log('✓ localStorage可用')
    }
    
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      logger.log('✓ 浏览器环境正常')
    }
    
    logger.log('✓ 极简测试版本初始化完成')
  } catch (e) {
    logger.error('✗ 初始化失败:', e)
  }
})()
