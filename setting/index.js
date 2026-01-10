/**
 * HAMGIS Settings App - 手机端设置应用
 * 使用 Zepp OS App Settings API
 */

AppSettingsPage({
  build(props) {
    console.log('HAMGIS Settings App build', props);
    
    // 从手表端读取测量数据
    const measurementsData = props.settingsStorage.getItem('hamgis_measurements');
    let measurements = [];
    
    try {
      if (measurementsData) {
        measurements = JSON.parse(measurementsData);
        console.log('成功读取测量数据:', measurements.length, '条');
      } else {
        console.log('暂无测量数据');
      }
    } catch (e) {
      console.error('解析数据失败:', e);
    }
    
    // 生成CSV摘要数据
    function generateCSVSummary() {
      if (measurements.length === 0) return '暂无数据';
      
      let csv = '项目名称,测量时间,面积(亩),面积(平方米),周长(米),点数,精度(米),平均海拔(米)\n';
      measurements.forEach(m => {
        const date = new Date(m.timestamp);
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        const areaMu = m.area?.mu?.toFixed(2) || '0.00';
        const areaM2 = m.area?.squareMeters?.toFixed(0) || '0';
        const perimeter = m.perimeter?.toFixed(1) || '0.0';
        const points = m.points?.length || 0;
        const accuracy = m.accuracy || 'N/A';
        const avgAlt = m.elevation?.average?.toFixed(1) || 'N/A';
        
        csv += `"${m.name || '未命名'}","${dateStr}",${areaMu},${areaM2},${perimeter},${points},${accuracy},${avgAlt}\n`;
      });
      return csv;
    }
    
    // 生成CSV详细数据
    function generateCSVDetailed() {
      if (measurements.length === 0) return '暂无数据';
      
      let csv = '项目名称,测量时间,点序号,纬度,经度,海拔(米),采集时间\n';
      measurements.forEach(m => {
        const date = new Date(m.timestamp);
        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        
        if (m.points && m.points.length > 0) {
          m.points.forEach((point, index) => {
            const pointTime = new Date(point.timestamp);
            const timeStr = `${pointTime.getHours().toString().padStart(2,'0')}:${pointTime.getMinutes().toString().padStart(2,'0')}:${pointTime.getSeconds().toString().padStart(2,'0')}`;
            const alt = point.altitude !== null && point.altitude !== undefined ? point.altitude.toFixed(1) : 'N/A';
            csv += `"${m.name || '未命名'}","${dateStr}",${index + 1},${point.lat.toFixed(6)},${point.lon.toFixed(6)},${alt},${timeStr}\n`;
          });
        }
      });
      return csv;
    }
    
    // 生成JSON数据
    function generateJSON() {
      if (measurements.length === 0) return '暂无数据';
      return JSON.stringify(measurements, null, 2);
    }
    
    // 生成GeoJSON数据
    function generateGeoJSON() {
      if (measurements.length === 0) return '暂无数据';
      
      const features = measurements.map(m => {
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [m.points.map(p => [p.lon, p.lat])]
          },
          properties: {
            name: m.name || '未命名',
            timestamp: m.timestamp,
            area_mu: m.area?.mu || 0,
            area_m2: m.area?.squareMeters || 0,
            perimeter: m.perimeter || 0,
            point_count: m.points?.length || 0,
            accuracy: m.accuracy || null,
            elevation: m.elevation || null
          }
        };
      });
      
      return JSON.stringify({
        type: 'FeatureCollection',
        features: features
      }, null, 2);
    }
    
    // 复制到剪贴板
    function copyToClipboard(text) {
      try {
        // 使用系统剪贴板API
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(text);
          return true;
        }
        return false;
      } catch (e) {
        console.error('复制失败:', e);
        return false;
      }
    }
    
    return View({}, [
      // 应用信息
      Section({
        title: 'HAMGIS 测亩'
      }, [
        Text({
          value: '版本: 1.0.1 | 开发者: BI4MIB'
        })
      ]),
      
      // 数据统计
      Section({
        title: '数据统计'
      }, [
        Text({
          value: `📊 共 ${measurements.length} 条测量记录`
        })
      ]),
      
      // CSV摘要数据展示
      Section({
        title: 'CSV摘要数据',
        description: '点击复制按钮可直接复制到剪贴板'
      }, [
        Text({
          value: generateCSVSummary()
        }),
        Button({
          label: '📋 复制CSV摘要',
          onClick: () => {
            const csv = generateCSVSummary();
            if (csv !== '暂无数据') {
              const success = copyToClipboard(csv);
              if (success) {
                console.log('CSV摘要已复制到剪贴板');
                // 显示提示
                props.settingsStorage.setItem('toast', JSON.stringify({
                  message: 'CSV摘要已复制到剪贴板'
                }));
              } else {
                console.log('复制失败，请手动复制');
              }
            }
          }
        })
      ]),
      
      // CSV详细数据展示
      Section({
        title: 'CSV详细数据',
        description: '包含所有采集点的坐标和海拔信息'
      }, [
        Text({
          value: generateCSVDetailed()
        }),
        Button({
          label: '📋 复制CSV详细',
          onClick: () => {
            const csv = generateCSVDetailed();
            if (csv !== '暂无数据') {
              const success = copyToClipboard(csv);
              if (success) {
                console.log('CSV详细已复制到剪贴板');
                props.settingsStorage.setItem('toast', JSON.stringify({
                  message: 'CSV详细已复制到剪贴板'
                }));
              } else {
                console.log('复制失败，请手动复制');
              }
            }
          }
        })
      ]),
      
      // JSON数据展示
      Section({
        title: 'JSON完整数据',
        description: '包含所有字段和元数据'
      }, [
        Text({
          value: generateJSON()
        }),
        Button({
          label: '📋 复制JSON',
          onClick: () => {
            const json = generateJSON();
            if (json !== '暂无数据') {
              const success = copyToClipboard(json);
              if (success) {
                console.log('JSON已复制到剪贴板');
                props.settingsStorage.setItem('toast', JSON.stringify({
                  message: 'JSON已复制到剪贴板'
                }));
              } else {
                console.log('复制失败，请手动复制');
              }
            }
          }
        })
      ]),
      
      // GeoJSON数据展示
      Section({
        title: 'GeoJSON数据',
        description: 'GIS标准格式，可导入专业软件'
      }, [
        Text({
          value: generateGeoJSON()
        }),
        Button({
          label: '📋 复制GeoJSON',
          onClick: () => {
            const geojson = generateGeoJSON();
            if (geojson !== '暂无数据') {
              const success = copyToClipboard(geojson);
              if (success) {
                console.log('GeoJSON已复制到剪贴板');
                props.settingsStorage.setItem('toast', JSON.stringify({
                  message: 'GeoJSON已复制到剪贴板'
                }));
              } else {
                console.log('复制失败，请手动复制');
              }
            }
          }
        })
      ]),
      
      // 数据同步说明
      Section({
        title: '使用说明',
        description: '如何同步和导出数据'
      }, [
        Text({
          value: '1. 手表端完成测量后数据自动保存\n2. 数据会通过Zepp OS同步到手机\n3. 点击上方的复制按钮获取数据\n4. 将复制的内容粘贴到Excel或文本编辑器\n5. CSV格式可直接导入Excel分析\n6. GeoJSON格式可导入ArcMap/QGIS'
        })
      ])
    ]);
  }
});