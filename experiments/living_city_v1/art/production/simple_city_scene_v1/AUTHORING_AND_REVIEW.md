# 简化 2D 活街区图层：候选试产记录

状态：**候选，尚未获美术批准**。此批是 `chicken_simple_2d_v1` 的程序绘制小样，仅供独立 Cocos 工程验证。没有使用 AI 整张背景、旧水彩图或照片。四件可点击任务物不烘焙在本批图层中。

## 源文件与处理

- 蓝图：`design/street_block_01.json`，严格按其 40 个 `artSlots` 的画布、中心点、层级导出。两处新街角工作物与南端建筑的实际占地写入 `physicalFootprints`，8 条 NPC 路线的几何验收通过。主纵路的可见行车面从约 615 压到 416 世界单位，横街从约 262 压到 190；可走多边形包括两侧人行带，仍保持四片公共区域连通。
- 源图：`render_scene.py` 的每个 `draw_*` / 组件函数及蓝图逐 ID 的 `purpose` 是本批逐项绘制任务。没有图像模型提示词。Pillow 以 2 倍目标尺寸确定性绘制原创形状，再用 Lanczos 缩至游戏尺寸，输出优化后的 RGBA PNG 并同步到 Bundle。地面 1536×2048 全不透明；39 个独立图层保留真 Alpha。`write_new_image_meta.py` 仅为新增 PNG 初始化 Cocos 3.8.8 的 UUID/裁剪数据；`refresh_revised_image_meta.py` 在保留旧 UUID 下刷新改画屋顶和推车的 SpriteFrame 裁剪数据。
- 游戏图：`assets/bundles/city_living_city_street_block_01/simple2d_scene/<id>.png`。`scene_manifest.json` 逐项保存 Asset ID、绘制目的、源规格、游戏规格、中心、层、SHA256 和候选状态。
- 机械验收：`validate_exports.py` 检查 40 张文件全在、尺寸精确、地面不透明、透明层四角为空、源图与 Bundle 副本的 SHA256 完全一致；详细输出 `qa_report.json`。`validate_target_occlusion.py` 按目标实际游戏尺寸和前景图 Alpha 测量四处叠盖率，输出 `occlusion_qa_report.json` 和 `review/target_foreground_contact.png`。
- 构图预览：`make_review.py` 从原图层按蓝图中心合成 `review/full_map_flat.png`，并按蓝图当前初始镜头裁出 `initial_444x960.png`，另留 `legacy_focus_minus150_444x960.png`、`tea_detail_444x960.png`、`wide_444x960.png`。这是静态构图审查；Cocos 浏览器运行和交互验收记录见 `docs/LIVING_CITY_ITERATION_02.md`。

## 逐项绘制内容

| Asset ID | 本批源绘制内容 |
| --- | --- |
| `lc_ground_paving` | 416 宽纵路、190 宽横街、人行带的小门前铺地、路缘、低对比石缝、浅车辙和平面交叉口石嵌纹样；不画凸起道具。 |
| `lc_west_storefront_back` | 原一座宽大店改为香草铺与陶器铺两间窄街屋，各有屋顶、门洞、货架和独立檐口。 |
| `lc_east_storefront_back` | 纸品铺的斜单坡顶与杂货铺的低四坡顶，短立面与不同商品陈列。 |
| `lc_west_tailor_back` | 布料铺与缎带铺两间小街屋，独立屋顶、门窗、悬挂布匹与靠街门槛。 |
| `lc_east_food_shop_back` | 热食铺的三角屋顶与谷物小铺的斜单坡顶，店窗食物陈列和袋装谷物。 |
| `lc_tea_stall_back` | 茶架两层陶器、烧水炉、备杯、木框；摊主留可站空间。 |
| `lc_tea_counter_front` | 纵向木台面、前唇、少量杯与茶叶；目标哨子位置 `(x≈34,y≈46)` 保留。 |
| `lc_tea_patio_front` | 茶摊南侧低茶桌、两个坐凳、残茶与杯碟；承担中屏茶摊外延生活场景，离横街与茶客支路有间距。 |
| `lc_tea_awning_front` | 独立赤陶布幌、折线、浅流苏；不跨越交接脚点。 |
| `lc_chestnut_cart_back` | 栗子盘、炉、纸袋与后柜；移至街边 `(270,-430)`，后层不再画重复车轮；夹子相对托盘位置保留。 |
| `lc_chestnut_cart_front` | 独立近侧车沿与唯一可见近侧轮毂遮挡，随车移至 `(270,-482)`。 |
| `lc_tree_front` | 木干分叉和不规则团状绿冠，保持单图层真 Alpha。 |
| `lc_planter_front` | 小盆栽与局部暖色花苞，底部着地。 |
| `lc_bench_front` | 木凳、支脚与少量凳面细节。 |
| `lc_curb_flower_display` | 南侧西路缘的木箱、三盆花、绿叶；与裁缝门口的货物一同形成可读陈列，不进入主街。 |
| `lc_tailor_goods` | 布卷、按钮、深底缝纫托盘；顶针位置 `(x≈91,y≈42)` 保留。 |
| `lc_tailor_work_rack` | 裁缝铺前的立架、分层布卷、布样和工作筐；不重复画可点击顶针。 |
| `lc_crates_front` | 裁缝铺旁两个高低错落的小木箱。 |
| `lc_shop_goods_east` | 东店门外双层器皿架。 |
| `lc_curb_pottery_west` | 西路缘三只不同色的陶罐。 |
| `lc_curb_produce_east` | 东路缘两只果蔬筐，货品与承托篮同层。 |
| `lc_wayfinding_sign` | 无字双向木路牌与地面接触。 |
| `lc_lantern_post_front` | 暖色灯罩、独立立柱和足部接触影。 |
| `lc_street_banner_front` | 赤陶布横幅、缝线和流苏；布结位置 `(x≈330,y≈40)` 不画重复目标。 |
| `lc_crossing_pennants` | 横街轻布旗与悬线，颜色取店面调色。 |
| `lc_tea_steam_fx` | 茶炉上方三束半透明蒸汽；运行时仍可追加轻摆动。 |
| `lc_north_herb_stand` | 北店与茶摊之间的窄香草工作架，三层花盆、收叶篮、架脚；不挡信使离场路线。 |
| `lc_east_bun_cart_back` | 主街东边的热食推车背层，布顶、蒸笼、碗叠、茶壶，有可解释的承托面。 |
| `lc_east_bun_cart_front` | 同一热食车低车沿、近侧双轮和下层挡板，按脚点排序。 |
| `lc_west_market_handcart` | 西横街杂货手车，袋装货物、板面、车柄、接地轮，位于茶座与长凳之间。 |
| `lc_street_water_station` | 路边鸡用饮水点，细木架、铁龙头、陶盆、抹布与水勺，不占角色路线。 |
| `lc_south_post_house_back` | 南端邮舍拆为较窄蓝灰屋顶分拣厅和低矮包裹廊，分拣架、拱门和无字信封徽记仍可辨。 |
| `lc_south_grain_house_back` | 南端谷物铺拆为较窄赤陶三角顶服务厅和侧边装粮棚，谷袋与编篮沿用同一投影。 |
| `lc_east_pottery_annex_back` | 东北店下方的窄陶器附屋：灰蓝屋顶、陶罐货架；原 `lc_shop_goods_east` 独立前景继续覆盖其下段。 |
| `lc_tea_delivery_nook` | 西侧茶摊补给角：二次使用的茶杯箱、补水罐和擦布，位于茶客回环路线外。 |
| `lc_tailor_delivery_stool` | 裁缝铺门外的送货小凳、折叠布匹与包裹，位于花商路线外。 |
| `lc_tea_whistle_foreground` | 哨子旁茶杯和碟边覆盖目标不透明像素 15.3%，目标仍独立可点击。 |
| `lc_tailor_thimble_foreground` | 缝纫盘前沿及线头覆盖顶针不透明像素 18.1%。 |
| `lc_banner_knot_foreground` | 横幅局部布褶覆盖绳结不透明像素 19.8%，结心与左右环保留。 |
| `lc_chestnut_tongs_foreground` | 栗子纸包边缘覆盖夹子柄部不透明像素 19.4%，夹口保留。 |

## 当前静态视觉审查

- `initial_444x960.png`：当前蓝图焦点 `(-230,20)`，茶摊、露天茶座、香草架、热食车、横街货车、饮水点、花箱和裁缝工作架可辨；路中的粉笔跳格子为低对比平面痕迹，仍供活动鸡通行。热食车和北店在首屏靠上，扩大了初始视野的活动语义覆盖；动态遮挡仍需 Cocos 复核。
- `legacy_focus_minus150_444x960.png`：旧焦点记录，仅作构图比较；本批没有修改当前焦点或信使路线。
- `tea_detail_444x960.png`：柜台器皿有承托关系；目标物待作为独立图加入后检查是否被杯/柜沿误遮。
- 南店屋顶原来会在同一矩形里压到横街长凳，现将南店顶部 90 单位留空；需在 Cocos 深度排序中再次看是否正确。
- 栗子摊与夹子整体移至东南店西侧街边：车 `(270,-430)`、夹子 `(253,-407)`，摊主脚点 `(150,-430)` 位于车左开放路面；车的后层重复轮子已删除。几何验证通过，视觉位置待整合构建复核。
- 四店共享一套结构语法，目前可读作同一街区，但细节仍是小样。若手机画面仍像静态舞台，需要提高可见活动和场景的局部功能变化，不能只靠地面细纹补救。
- 本次 40 层静态图与 Bundle 副本已导出，几何、尺寸、Alpha 和四目标前景叠盖机械检查通过。南端两栋需要向下拖动地图才能看全；前三个目标和初始镜头保持原位，板栗夹随车移动。Cocos Web Mobile 浏览器整合检查已载入 40/40 图层、8 NPC，四项任务可完成到 `4/4`，运行错误为 0；板栗摊主脚点在推车左侧地面，未压车轮和店面。真机尚未验收。
- **验收状态：40 层机械、路线与 Cocos 浏览器整合检查通过；玩家视觉评价及微信真机待验。** 不能登记为已批准美术。
