# v3 街区居民画风修订

状态：trial_unapproved，仍待玩家视觉审阅。源文件：`assets/scripts/character/AmbientChickenPainter.ts`。运行调用：`assets/scripts/map/LivingCityGreybox.ts`。这些角色没有 PNG；在源代码中按脚点与活动姿态重画。

| Asset ID / role | 当前画法 |
| --- | --- |
| vendor | 浅麦黄鸡、青蓝头巾、珊瑚围裙、递杯动作 |
| ambient_shopper | 暖白鸡、草绿衣装、斜背包、交替脚步 |
| ambient_vendor | 麦黄鸡、珊瑚帽、绿围裙、木勺 |
| ambient_watcher | 暖白鸡、青蓝披肩、抬翼招呼 |
| tea_regular | 浅麦黄鸡、青蓝背心、帽子与茶杯、饮茶循环 |
| flower_buyer | 暖白鸡、珊瑚外套、绿头巾、花篮 |
| lane_child | 小体型鸡、珊瑚长围巾、较短步频 |

本轮改变公共颜色和描边色，保留各角色已有三向几何、120 单位参考身高、节点 `(0,0)` 脚点和活动时间。没有新增角色或动作数量。TypeScript 与当前批次 Cocos Web Mobile 验收结果见 `qa_report.json`，微信真机与玩家视觉批准未完成。
